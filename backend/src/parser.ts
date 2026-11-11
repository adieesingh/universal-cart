import * as cheerio from "cheerio";

export type ParsedProduct = {
  url: string; // final URL after redirects
  canonicalUrl: string; // cleaned URL used to de-duplicate
  store: string;
  title: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
};

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** Share text from apps looks like "Check this out! https://a.co/d/abc123" — pull out the URL. */
export function extractUrl(text: string): string | null {
  const m = text.match(URL_RE);
  if (!m) return null;
  return m[0].replace(/[).,;!]+$/, "");
}

export function detectStore(hostname: string): string {
  const h = hostname.replace(/^www\./, "").toLowerCase();
  if (/(^|\.)amazon\.|^a\.co$|^amzn\./.test(h)) return "Amazon";
  if (/flipkart\.com$|^fkrt\.|^dl\.flipkart/.test(h)) return "Flipkart";
  if (/myntra\.com$/.test(h)) return "Myntra";
  if (/ajio\.com$/.test(h)) return "Ajio";
  if (/meesho\.com$/.test(h)) return "Meesho";
  if (/nykaa\.com$/.test(h)) return "Nykaa";
  // fallback: "shop.example.co.uk" -> "Example"
  const parts = h.split(".");
  const name = parts.length >= 2 ? parts[parts.length - 2] : h;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Strip tracking junk so the same product shared twice is the same cart row. */
export function canonicalize(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  const host = u.hostname.replace(/^www\./, "");

  if (detectStore(host) === "Amazon") {
    const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    if (m) return `${u.protocol}//${u.hostname}/dp/${m[1].toUpperCase()}`;
  }

  if (detectStore(host) === "Flipkart") {
    const pid = u.searchParams.get("pid");
    u.search = pid ? `?pid=${pid}` : "";
    u.hash = "";
    return u.toString();
  }

  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (!/^(utm_|ref|tag|fbclid|gclid|igshid|mc_|spm|_encoding)/i.test(k)) keep.set(k, v);
  }
  u.search = keep.toString() ? `?${keep.toString()}` : "";
  u.hash = "";
  return u.toString();
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function firstImage(img: unknown): string | null {
  if (!img) return null;
  if (typeof img === "string") return img;
  if (Array.isArray(img)) return firstImage(img[0]);
  if (typeof img === "object" && "url" in (img as any)) return firstImage((img as any).url);
  return null;
}

function findProductNode(node: any): any | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findProductNode(n);
      if (f) return f;
    }
    return null;
  }
  if (typeof node === "object") {
    const t = node["@type"];
    if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return node;
    if (node["@graph"]) return findProductNode(node["@graph"]);
  }
  return null;
}

/** Pure HTML -> product data. Kept separate from fetching so it is easy to test. */
export function parseHtml(html: string): Pick<ParsedProduct, "title" | "image" | "price" | "currency"> {
  const $ = cheerio.load(html);
  let title: string | null = null;
  let image: string | null = null;
  let price: number | null = null;
  let currency: string | null = null;

  // 1) JSON-LD Product
  $('script[type="application/ld+json"]').each((_, el) => {
    if (title && price != null) return;
    try {
      const data = JSON.parse($(el).contents().text());
      const p = findProductNode(data);
      if (!p) return;
      title ||= p.name ?? null;
      image ||= firstImage(p.image);
      const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      if (offers) {
        price ??= toNumber(offers.price ?? offers.lowPrice);
        currency ||= offers.priceCurrency ?? null;
      }
    } catch {
      /* invalid JSON-LD, ignore */
    }
  });

  // 2) Open Graph / meta fallbacks
  const meta = (sel: string) => $(sel).attr("content")?.trim() || null;
  title ||= meta('meta[property="og:title"]') ?? meta('meta[name="twitter:title"]');
  image ||= meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]');
  price ??= toNumber(
    meta('meta[property="product:price:amount"]') ?? meta('meta[property="og:price:amount"]'),
  );
  currency ||=
    meta('meta[property="product:price:currency"]') ?? meta('meta[property="og:price:currency"]');

  // 3) Last resort: <title>, and Amazon's price element
  title ||= $("title").first().text().trim() || null;
  if (price == null) {
    price = toNumber($("#corePrice_feature_div .a-offscreen").first().text()) ??
      toNumber($(".a-price .a-offscreen").first().text());
    if (price != null && !currency) currency = "INR";
  }

  return { title: title?.slice(0, 300) ?? null, image, price, currency };
}

const UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

/**
 * Resolve short links, fetch the page, extract product data.
 * Never throws for blocked / failed pages: the link is still saved, just with less detail.
 */
export async function fetchProduct(rawUrl: string): Promise<ParsedProduct> {
  let finalUrl = rawUrl;
  let parsed: ReturnType<typeof parseHtml> = { title: null, image: null, price: null, currency: null };

  try {
    const res = await fetch(rawUrl, {
      redirect: "follow",
      headers: { "user-agent": UA, "accept-language": "en-IN,en;q=0.9", accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
    finalUrl = res.url || rawUrl;
    if (res.ok) parsed = parseHtml(await res.text());
  } catch {
    /* network error / timeout: fall through with what we have */
  }

  const host = (() => {
    try {
      return new URL(finalUrl).hostname;
    } catch {
      return "unknown";
    }
  })();

  return {
    url: finalUrl,
    canonicalUrl: canonicalize(finalUrl),
    store: detectStore(host),
    ...parsed,
  };
}
