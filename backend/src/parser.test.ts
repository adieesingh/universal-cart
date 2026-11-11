import assert from "node:assert/strict";
import { canonicalize, detectStore, extractUrl, parseHtml } from "./parser.js";

// extractUrl
assert.equal(
  extractUrl("Check out this product on Amazon! https://a.co/d/abc123"),
  "https://a.co/d/abc123",
);
assert.equal(extractUrl("no link here"), null);

// detectStore
assert.equal(detectStore("www.amazon.in"), "Amazon");
assert.equal(detectStore("a.co"), "Amazon");
assert.equal(detectStore("dl.flipkart.com"), "Flipkart");
assert.equal(detectStore("www.myntra.com"), "Myntra");
assert.equal(detectStore("shop.example.co.uk"), "Co");

// canonicalize
assert.equal(
  canonicalize("https://www.amazon.in/Some-Product-Name/dp/B0ABCDEFGH/ref=sr_1_1?tag=x&th=1"),
  "https://www.amazon.in/dp/B0ABCDEFGH",
);
assert.equal(
  canonicalize("https://www.flipkart.com/p/item?pid=MOBABC123&lid=LSTx&otracker=foo"),
  "https://www.flipkart.com/p/item?pid=MOBABC123",
);
assert.equal(
  canonicalize("https://shop.test/p/1?utm_source=a&color=red"),
  "https://shop.test/p/1?color=red",
);

// parseHtml: JSON-LD
const ld = `<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Test Phone","image":["https://img/x.jpg"],
"offers":{"@type":"Offer","price":"19,999.00","priceCurrency":"INR"}}]}
</script></head></html>`;
assert.deepEqual(parseHtml(ld), {
  title: "Test Phone",
  image: "https://img/x.jpg",
  price: 19999,
  currency: "INR",
});

// parseHtml: Open Graph fallback
const og = `<html><head>
<meta property="og:title" content="Cool Shoes"><meta property="og:image" content="https://img/s.png">
<meta property="product:price:amount" content="2499"><meta property="product:price:currency" content="INR">
</head></html>`;
assert.deepEqual(parseHtml(og), {
  title: "Cool Shoes",
  image: "https://img/s.png",
  price: 2499,
  currency: "INR",
});

console.log("parser tests passed");
