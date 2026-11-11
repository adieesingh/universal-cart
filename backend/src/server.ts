import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { extractUrl, fetchProduct } from "./parser.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { id: string };
    user: { id: string };
  }
}

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });

const auth = async (req: any, reply: any) => {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
  }
};

// ---------- Auth ----------
const credentials = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(6),
});

app.post("/auth/register", async (req, reply) => {
  const body = credentials.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "Valid email and 6+ char password required" });
  const { email, password } = body.data;
  if (await prisma.user.findUnique({ where: { email } }))
    return reply.code(409).send({ error: "Email already registered" });
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10) },
  });
  return { token: app.jwt.sign({ id: user.id }, { expiresIn: "30d" }) };
});

app.post("/auth/login", async (req, reply) => {
  const body = credentials.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid input" });
  const user = await prisma.user.findUnique({ where: { email: body.data.email } });
  if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash)))
    return reply.code(401).send({ error: "Wrong email or password" });
  return { token: app.jwt.sign({ id: user.id }, { expiresIn: "30d" }) };
});

// ---------- Cart ----------
// Body: { text: "<share text or plain URL>" }
app.post("/items", { preHandler: auth }, async (req, reply) => {
  const body = z.object({ text: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "text is required" });

  const url = extractUrl(body.data.text);
  if (!url) return reply.code(400).send({ error: "No link found in shared text" });

  const p = await fetchProduct(url);
  const userId = req.user.id;

  const existing = await prisma.cartItem.findUnique({
    where: { userId_canonicalUrl: { userId, canonicalUrl: p.canonicalUrl } },
  });

  if (existing) {
    // Same product shared again: refresh details, don't create a duplicate row.
    const item = await prisma.cartItem.update({
      where: { id: existing.id },
      data: {
        title: p.title ?? existing.title,
        image: p.image ?? existing.image,
        price: p.price ?? existing.price,
        currency: p.currency ?? existing.currency,
        lastCheckedAt: new Date(),
      },
    });
    return reply.code(200).send({ item, duplicate: true });
  }

  const item = await prisma.cartItem.create({
    data: {
      userId,
      url: p.url,
      canonicalUrl: p.canonicalUrl,
      store: p.store,
      title: p.title,
      image: p.image,
      price: p.price,
      currency: p.currency,
    },
  });
  if (p.price != null) await prisma.priceHistory.create({ data: { itemId: item.id, price: p.price } });
  return reply.code(201).send({ item, duplicate: false });
});

app.get("/items", { preHandler: auth }, async (req) => {
  const items = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  return { items };
});

app.patch("/items/:id", { preHandler: auth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = z.object({ quantity: z.number().int().min(1).max(99) }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "quantity must be 1-99" });
  const res = await prisma.cartItem.updateMany({
    where: { id, userId: req.user.id },
    data: { quantity: body.data.quantity },
  });
  if (res.count === 0) return reply.code(404).send({ error: "Not found" });
  return { ok: true };
});

app.delete("/items/:id", { preHandler: auth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const res = await prisma.cartItem.deleteMany({ where: { id, userId: req.user.id } });
  if (res.count === 0) return reply.code(404).send({ error: "Not found" });
  return { ok: true };
});

app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
