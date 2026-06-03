import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const port = Number(process.env.PORT || 4000);
const nodeEnv = process.env.NODE_ENV || "development";
const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/farmdb";
const jwtSecret = process.env.JWT_SECRET || "change_me_in_production";
const publicRegistrationEnabled = isTruthy(process.env.ALLOW_PUBLIC_REGISTRATION ?? (nodeEnv === "production" ? "false" : "true"));
const allowRenderPreviewOrigins = isTruthy(process.env.ALLOW_RENDER_PREVIEW_ORIGINS);
const defaultCorsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost"
];
const corsOrigins = [
  ...defaultCorsOrigins,
  ...(process.env.CORS_ORIGINS || "").split(","),
  process.env.FRONTEND_PUBLIC_URL
].map((item) => String(item || "").trim()).filter(Boolean);

if (nodeEnv === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL é obrigatório em produção. Configure a connection string do Neon no Render.");
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

if (nodeEnv === "production" && (jwtSecret === "change_me_in_production" || jwtSecret.length < 16)) {
  throw new Error("JWT_SECRET inseguro para produção. Configure um segredo forte com pelo menos 16 caracteres.");
}

const prisma = new PrismaClient();
const app = express();

app.use(express.json({ limit: "10mb" }));

function isTruthy(value) {
  return ["1", "true", "yes", "sim", "on"].includes(String(value || "").trim().toLowerCase());
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
}

function isCorsAllowed(origin) {
  if (!origin) return false;
  if (corsOrigins.includes("*") || corsOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const host = url.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      (allowRenderPreviewOrigins && url.protocol === "https:" && host.endsWith(".onrender.com")) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  if (origin && isCorsAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigins.includes("*") ? "*" : origin);
    if (!corsOrigins.includes("*")) {
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}

function createRateLimiter({ windowMs, maxRequests }) {
  const store = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const entry = store.get(ip);

    if (!entry || now - entry.start > windowMs) {
      store.set(ip, { count: 1, start: now });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      res.status(429).json({ error: "Muitas requisições. Tente novamente mais tarde." });
      return;
    }

    entry.count += 1;
    next();
  };
}

const globalLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 300 });
const authLimiter = createRateLimiter({ windowMs: 10 * 60_000, maxRequests: 20 });

app.use(securityHeaders);
app.use(corsMiddleware);
app.use(globalLimiter);

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

async function seedInitialAdmin() {
  if (!isTruthy(process.env.SEED_ADMIN)) {
    return;
  }

  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "Administrador").trim() || "Administrador";

  if (!email || password.length < 6) {
    throw new Error("SEED_ADMIN=true exige ADMIN_EMAIL e ADMIN_PASSWORD com no mínimo 6 caracteres.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "ADMIN"
    }
  });

  console.log(`Admin inicial criado: ${email}`);
}

function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, jwtSecret, { expiresIn: "8h" });
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Token ausente" });
    return;
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    next();
  };
}

function isPrivileged(user) {
  return ["ADMIN", "MANAGER"].includes(user?.role);
}

async function createUserAccount({ name, email, password, role }) {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "");
  const normalizedRole = String(role || "OPERATOR").toUpperCase();

  if (!normalizedName || !normalizedEmail || normalizedPassword.length < 6) {
    throw Object.assign(new Error("Dados inválidos. Informe nome, email e senha com no mínimo 6 caracteres."), { status: 400 });
  }

  if (!["ADMIN", "MANAGER", "OPERATOR"].includes(normalizedRole)) {
    throw Object.assign(new Error("Role inválida. Use ADMIN, MANAGER ou OPERATOR."), { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existing) {
    throw Object.assign(new Error("Email já cadastrado"), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(normalizedPassword, 10);
  return prisma.user.create({
    data: { name: normalizedName, email: normalizedEmail, passwordHash, role: normalizedRole },
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
}

async function canAccessFarm(farmId, user) {
  const farm = await prisma.farm.findUnique({ where: { id: farmId } });

  if (!farm) {
    return { allowed: false, reason: "not_found" };
  }

  if (isPrivileged(user) || farm.ownerId === user.sub) {
    return { allowed: true, farm };
  }

  return { allowed: false, reason: "forbidden" };
}

async function canAccessActivity(activityId, user) {
  const activity = await prisma.activity.findUnique({ where: { id: activityId }, include: { farm: true } });

  if (!activity) {
    return { allowed: false, reason: "not_found" };
  }

  if (isPrivileged(user) || activity.farm.ownerId === user.sub) {
    return { allowed: true, activity };
  }

  return { allowed: false, reason: "forbidden" };
}

async function canAccessRecord(recordId, user) {
  const record = await prisma.operationalRecord.findUnique({ where: { id: recordId }, include: { farm: true } });

  if (!record) {
    return { allowed: false, reason: "not_found" };
  }

  if (isPrivileged(user) || record.createdById === user.sub || record.farm?.ownerId === user.sub) {
    return { allowed: true, record };
  }

  return { allowed: false, reason: "forbidden" };
}

function parseOptionalDate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} inválida`);
  }

  return date;
}

function safeOptionalDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeRecordData(data) {
  if (data === undefined || data === null || data === "") {
    return {};
  }

  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error("data deve ser um objeto JSON");
  }

  return data;
}

async function validateRecordRelations({ farmId, plotId, cropId }, user) {
  const normalized = {
    farmId: farmId ? String(farmId).trim() : null,
    plotId: plotId ? String(plotId).trim() : null,
    cropId: cropId ? String(cropId).trim() : null
  };

  if (normalized.farmId) {
    const access = await canAccessFarm(normalized.farmId, user);

    if (!access.allowed) {
      const status = access.reason === "not_found" ? 404 : 403;
      throw Object.assign(new Error(access.reason === "not_found" ? "Fazenda não encontrada" : "Acesso negado"), { status });
    }
  }

  if (normalized.plotId) {
    const plot = await prisma.plot.findUnique({ where: { id: normalized.plotId } });

    if (!plot) {
      throw Object.assign(new Error("Talhão não encontrado"), { status: 404 });
    }

    if (normalized.farmId && plot.farmId !== normalized.farmId) {
      throw Object.assign(new Error("Talhão não pertence à fazenda selecionada"), { status: 400 });
    }

    const access = await canAccessFarm(plot.farmId, user);

    if (!access.allowed) {
      throw Object.assign(new Error("Acesso negado ao talhão"), { status: 403 });
    }

    normalized.farmId = plot.farmId;
  }

  if (normalized.cropId) {
    const crop = await prisma.crop.findUnique({ where: { id: normalized.cropId } });

    if (!crop) {
      throw Object.assign(new Error("Cultura não encontrada"), { status: 404 });
    }
  }

  return normalized;
}

function numberFromData(data, keys) {
  for (const key of keys) {
    const value = data?.[key];
    const number = value === undefined || value === null || value === "" ? NaN : Number(value);

    if (!Number.isNaN(number)) {
      return number;
    }
  }

  return 0;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", database: "ok", environment: nodeEnv });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable", environment: nodeEnv });
  }
});

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Agro Gerenciamento API",
    docs: "/docs"
  });
});

app.get("/docs", (_req, res) => {
  res.status(200).json({
    auth: ["POST /auth/register", "POST /auth/login", "GET /auth/me", "GET /users", "POST /users"],
    farms: ["GET /farms", "POST /farms", "PUT /farms/:id", "DELETE /farms/:id"],
    plots: ["GET /plots?farmId=...", "POST /plots", "PUT /plots/:id", "DELETE /plots/:id"],
    crops: ["GET /crops", "POST /crops", "PUT /crops/:id", "DELETE /crops/:id"],
    activities: ["GET /activities", "POST /activities", "PUT /activities/:id", "DELETE /activities/:id"],
    operationalRecords: ["GET /operational-records", "POST /operational-records", "PUT /operational-records/:id", "DELETE /operational-records/:id"],
    dashboard: ["GET /dashboard/operational"],
    reports: ["GET /reports/activities-summary", "GET /reports/activities-by-crop", "GET /reports/operational"]
  });
});

app.post("/auth/register", authLimiter, async (req, res) => {
  const usersCount = await prisma.user.count();

  if (!publicRegistrationEnabled && usersCount > 0) {
    res.status(403).json({ error: "Cadastro público desativado. Solicite a criação do usuário ao administrador." });
    return;
  }

  try {
    const user = await createUserAccount(req.body || {});
    const token = createToken(user);
    res.status(201).json({ user, token });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post("/auth/login", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!email || !password) {
    res.status(400).json({ error: "Email e senha são obrigatórios" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const token = createToken(user);

  res.status(200).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

app.get("/auth/me", authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
  });

  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  res.status(200).json({ user });
});

app.get("/users", authRequired, roleRequired("ADMIN", "MANAGER"), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });

  res.status(200).json({ items: users });
});

app.post("/users", authRequired, roleRequired("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const user = await createUserAccount(req.body || {});
    res.status(201).json({ user });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.get("/farms", authRequired, async (req, res) => {
  const where = isPrivileged(req.user) ? {} : { ownerId: req.user.sub };
  const items = await prisma.farm.findMany({
    where,
    include: { owner: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" }
  });
  res.status(200).json({ items });
});

app.post("/farms", authRequired, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const location = req.body?.location ? String(req.body.location).trim() : null;
  const areaInput = req.body?.areaHectare;
  const areaHectare = areaInput === undefined || areaInput === null || areaInput === "" ? null : Number(areaInput);

  if (!name) {
    res.status(400).json({ error: "Nome da fazenda é obrigatório" });
    return;
  }

  if (areaHectare !== null && Number.isNaN(areaHectare)) {
    res.status(400).json({ error: "Área inválida" });
    return;
  }

  const farm = await prisma.farm.create({
    data: { name, location, areaHectare, ownerId: req.user.sub },
    include: { owner: { select: { id: true, name: true, email: true } } }
  });

  res.status(201).json({ item: farm });
});

app.put("/farms/:id", authRequired, async (req, res) => {
  const farmId = req.params.id;
  const existing = await prisma.farm.findUnique({ where: { id: farmId } });

  if (!existing) {
    res.status(404).json({ error: "Fazenda não encontrada" });
    return;
  }

  if (!isPrivileged(req.user) && existing.ownerId !== req.user.sub) {
    res.status(403).json({ error: "Você não pode alterar essa fazenda" });
    return;
  }

  const data = {};

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();

    if (!name) {
      res.status(400).json({ error: "Nome da fazenda é obrigatório" });
      return;
    }

    data.name = name;
  }

  if (req.body?.location !== undefined) {
    data.location = req.body.location ? String(req.body.location).trim() : null;
  }

  if (req.body?.areaHectare !== undefined) {
    const area = req.body.areaHectare === null || req.body.areaHectare === "" ? null : Number(req.body.areaHectare);

    if (area !== null && Number.isNaN(area)) {
      res.status(400).json({ error: "Área inválida" });
      return;
    }

    data.areaHectare = area;
  }

  const farm = await prisma.farm.update({ where: { id: farmId }, data });
  res.status(200).json({ item: farm });
});

app.delete("/farms/:id", authRequired, async (req, res) => {
  const farmId = req.params.id;
  const existing = await prisma.farm.findUnique({ where: { id: farmId } });

  if (!existing) {
    res.status(404).json({ error: "Fazenda não encontrada" });
    return;
  }

  if (!isPrivileged(req.user) && existing.ownerId !== req.user.sub) {
    res.status(403).json({ error: "Você não pode excluir essa fazenda" });
    return;
  }

  await prisma.farm.delete({ where: { id: farmId } });
  res.status(204).end();
});

app.get("/plots", authRequired, async (req, res) => {
  const farmId = String(req.query.farmId || "").trim();

  if (!farmId) {
    res.status(400).json({ error: "farmId é obrigatório" });
    return;
  }

  const access = await canAccessFarm(farmId, req.user);

  if (!access.allowed) {
    res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Fazenda não encontrada" : "Acesso negado" });
    return;
  }

  const items = await prisma.plot.findMany({
    where: { farmId },
    include: { farm: { select: { id: true, name: true, ownerId: true } } },
    orderBy: { createdAt: "desc" }
  });

  res.status(200).json({ items });
});

app.post("/plots", authRequired, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const farmId = String(req.body?.farmId || "").trim();
  const areaInput = req.body?.areaHectare;
  const areaHectare = areaInput === undefined || areaInput === null || areaInput === "" ? null : Number(areaInput);

  if (!name || !farmId) {
    res.status(400).json({ error: "Nome e farmId são obrigatórios" });
    return;
  }

  if (areaHectare !== null && Number.isNaN(areaHectare)) {
    res.status(400).json({ error: "Área inválida" });
    return;
  }

  const access = await canAccessFarm(farmId, req.user);

  if (!access.allowed) {
    res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Fazenda não encontrada" : "Acesso negado" });
    return;
  }

  const item = await prisma.plot.create({ data: { name, farmId, areaHectare } });
  res.status(201).json({ item });
});

app.put("/plots/:id", authRequired, async (req, res) => {
  const plotId = req.params.id;
  const existing = await prisma.plot.findUnique({ where: { id: plotId }, include: { farm: true } });

  if (!existing) {
    res.status(404).json({ error: "Talhão não encontrado" });
    return;
  }

  const access = await canAccessFarm(existing.farmId, req.user);

  if (!access.allowed) {
    res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Fazenda não encontrada" : "Acesso negado" });
    return;
  }

  const data = {};

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();

    if (!name) {
      res.status(400).json({ error: "Nome do talhão é obrigatório" });
      return;
    }

    data.name = name;
  }

  if (req.body?.areaHectare !== undefined) {
    const area = req.body.areaHectare === null || req.body.areaHectare === "" ? null : Number(req.body.areaHectare);

    if (area !== null && Number.isNaN(area)) {
      res.status(400).json({ error: "Área inválida" });
      return;
    }

    data.areaHectare = area;
  }

  if (req.body?.farmId !== undefined) {
    const targetFarmId = String(req.body.farmId || "").trim();

    if (!targetFarmId) {
      res.status(400).json({ error: "farmId inválido" });
      return;
    }

    const targetAccess = await canAccessFarm(targetFarmId, req.user);

    if (!targetAccess.allowed) {
      res.status(targetAccess.reason === "not_found" ? 404 : 403).json({ error: targetAccess.reason === "not_found" ? "Fazenda não encontrada" : "Acesso negado" });
      return;
    }

    data.farmId = targetFarmId;
  }

  const item = await prisma.plot.update({ where: { id: plotId }, data });
  res.status(200).json({ item });
});

app.delete("/plots/:id", authRequired, async (req, res) => {
  const plotId = req.params.id;
  const existing = await prisma.plot.findUnique({ where: { id: plotId }, include: { farm: true } });

  if (!existing) {
    res.status(404).json({ error: "Talhão não encontrado" });
    return;
  }

  const access = await canAccessFarm(existing.farmId, req.user);

  if (!access.allowed) {
    res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Fazenda não encontrada" : "Acesso negado" });
    return;
  }

  await prisma.plot.delete({ where: { id: plotId } });
  res.status(204).end();
});

app.get("/crops", authRequired, async (_req, res) => {
  const items = await prisma.crop.findMany({ orderBy: { name: "asc" } });
  res.status(200).json({ items });
});

app.post("/crops", authRequired, roleRequired("ADMIN", "MANAGER"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const scientificName = req.body?.scientificName ? String(req.body.scientificName).trim() : null;
  const cycleDaysInput = req.body?.cycleDays;
  const cycleDays = cycleDaysInput === undefined || cycleDaysInput === null || cycleDaysInput === "" ? null : Number(cycleDaysInput);

  if (!name) {
    res.status(400).json({ error: "Nome da cultura é obrigatório" });
    return;
  }

  if (cycleDays !== null && !Number.isInteger(cycleDays)) {
    res.status(400).json({ error: "cycleDays deve ser inteiro" });
    return;
  }

  const item = await prisma.crop.create({ data: { name, scientificName, cycleDays } });
  res.status(201).json({ item });
});

app.put("/crops/:id", authRequired, roleRequired("ADMIN", "MANAGER"), async (req, res) => {
  const cropId = req.params.id;
  const existing = await prisma.crop.findUnique({ where: { id: cropId } });

  if (!existing) {
    res.status(404).json({ error: "Cultura não encontrada" });
    return;
  }

  const data = {};

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();

    if (!name) {
      res.status(400).json({ error: "Nome da cultura é obrigatório" });
      return;
    }

    data.name = name;
  }

  if (req.body?.scientificName !== undefined) {
    data.scientificName = req.body.scientificName ? String(req.body.scientificName).trim() : null;
  }

  if (req.body?.cycleDays !== undefined) {
    const cycleDays = req.body.cycleDays === null || req.body.cycleDays === "" ? null : Number(req.body.cycleDays);

    if (cycleDays !== null && !Number.isInteger(cycleDays)) {
      res.status(400).json({ error: "cycleDays deve ser inteiro" });
      return;
    }

    data.cycleDays = cycleDays;
  }

  const item = await prisma.crop.update({ where: { id: cropId }, data });
  res.status(200).json({ item });
});

app.delete("/crops/:id", authRequired, roleRequired("ADMIN", "MANAGER"), async (req, res) => {
  const cropId = req.params.id;
  const existing = await prisma.crop.findUnique({ where: { id: cropId } });

  if (!existing) {
    res.status(404).json({ error: "Cultura não encontrada" });
    return;
  }

  await prisma.crop.delete({ where: { id: cropId } });
  res.status(204).end();
});

app.get("/activities", authRequired, async (req, res) => {
  const where = {};

  if (!isPrivileged(req.user)) {
    where.farm = { ownerId: req.user.sub };
  }

  if (req.query.farmId) {
    where.farmId = String(req.query.farmId);
  }

  if (req.query.plotId) {
    where.plotId = String(req.query.plotId);
  }

  if (req.query.cropId) {
    where.cropId = String(req.query.cropId);
  }

  if (req.query.type) {
    where.type = String(req.query.type);
  }

  if (req.query.startDate || req.query.endDate) {
    where.date = {};

    if (req.query.startDate) {
      where.date.gte = new Date(String(req.query.startDate));
    }

    if (req.query.endDate) {
      where.date.lte = new Date(String(req.query.endDate));
    }
  }

  const items = await prisma.activity.findMany({
    where,
    include: {
      farm: { select: { id: true, name: true } },
      plot: { select: { id: true, name: true } },
      crop: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } }
    },
    orderBy: { date: "desc" }
  });

  res.status(200).json({ items });
});

app.post("/activities", authRequired, async (req, res) => {
  const type = String(req.body?.type || "").toUpperCase();
  const farmId = String(req.body?.farmId || "").trim();
  const plotId = req.body?.plotId ? String(req.body.plotId).trim() : null;
  const cropId = req.body?.cropId ? String(req.body.cropId).trim() : null;
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;
  const unit = req.body?.unit ? String(req.body.unit).trim() : null;
  const dateInput = req.body?.date;
  const quantityInput = req.body?.quantity;

  if (!["PLANTIO", "COLHEITA", "APLICACAO"].includes(type) || !farmId || !dateInput) {
    res.status(400).json({ error: "type, farmId e date são obrigatórios" });
    return;
  }

  const date = new Date(String(dateInput));

  if (Number.isNaN(date.getTime())) {
    res.status(400).json({ error: "Data inválida" });
    return;
  }

  const quantity = quantityInput === undefined || quantityInput === null || quantityInput === "" ? null : Number(quantityInput);

  if (quantity !== null && Number.isNaN(quantity)) {
    res.status(400).json({ error: "Quantidade inválida" });
    return;
  }

  const access = await canAccessFarm(farmId, req.user);

  if (!access.allowed) {
    res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Fazenda não encontrada" : "Acesso negado" });
    return;
  }

  const item = await prisma.activity.create({
    data: {
      type,
      date,
      notes,
      quantity,
      unit,
      farmId,
      plotId,
      cropId,
      createdById: req.user.sub
    },
    include: {
      farm: { select: { id: true, name: true } },
      plot: { select: { id: true, name: true } },
      crop: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } }
    }
  });

  res.status(201).json({ item });
});

app.put("/activities/:id", authRequired, async (req, res) => {
  const activityId = req.params.id;
  const access = await canAccessActivity(activityId, req.user);

  if (!access.allowed) {
    res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Atividade não encontrada" : "Acesso negado" });
    return;
  }

  const data = {};

  if (req.body?.type !== undefined) {
    const type = String(req.body.type || "").toUpperCase();

    if (!["PLANTIO", "COLHEITA", "APLICACAO"].includes(type)) {
      res.status(400).json({ error: "Tipo inválido" });
      return;
    }

    data.type = type;
  }

  if (req.body?.date !== undefined) {
    const date = new Date(String(req.body.date));

    if (Number.isNaN(date.getTime())) {
      res.status(400).json({ error: "Data inválida" });
      return;
    }

    data.date = date;
  }

  if (req.body?.notes !== undefined) {
    data.notes = req.body.notes ? String(req.body.notes).trim() : null;
  }

  if (req.body?.unit !== undefined) {
    data.unit = req.body.unit ? String(req.body.unit).trim() : null;
  }

  if (req.body?.quantity !== undefined) {
    const quantity = req.body.quantity === null || req.body.quantity === "" ? null : Number(req.body.quantity);

    if (quantity !== null && Number.isNaN(quantity)) {
      res.status(400).json({ error: "Quantidade inválida" });
      return;
    }

    data.quantity = quantity;
  }

  if (req.body?.farmId !== undefined) {
    const farmId = String(req.body.farmId || "").trim();

    if (!farmId) {
      res.status(400).json({ error: "farmId inválido" });
      return;
    }

    const farmAccess = await canAccessFarm(farmId, req.user);

    if (!farmAccess.allowed) {
      res.status(farmAccess.reason === "not_found" ? 404 : 403).json({ error: farmAccess.reason === "not_found" ? "Fazenda não encontrada" : "Acesso negado" });
      return;
    }

    data.farmId = farmId;
  }

  if (req.body?.plotId !== undefined) {
    data.plotId = req.body.plotId ? String(req.body.plotId).trim() : null;
  }

  if (req.body?.cropId !== undefined) {
    data.cropId = req.body.cropId ? String(req.body.cropId).trim() : null;
  }

  const item = await prisma.activity.update({
    where: { id: activityId },
    data,
    include: {
      farm: { select: { id: true, name: true } },
      plot: { select: { id: true, name: true } },
      crop: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } }
    }
  });

  res.status(200).json({ item });
});

app.delete("/activities/:id", authRequired, async (req, res) => {
  const access = await canAccessActivity(req.params.id, req.user);

  if (!access.allowed) {
    res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Atividade não encontrada" : "Acesso negado" });
    return;
  }

  await prisma.activity.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.get("/reports/activities-summary", authRequired, async (req, res) => {
  const where = {};

  if (!isPrivileged(req.user)) {
    where.farm = { ownerId: req.user.sub };
  }

  if (req.query.farmId) {
    where.farmId = String(req.query.farmId);
  }

  if (req.query.startDate || req.query.endDate) {
    where.date = {};

    if (req.query.startDate) {
      where.date.gte = new Date(String(req.query.startDate));
    }

    if (req.query.endDate) {
      where.date.lte = new Date(String(req.query.endDate));
    }
  }

  const items = await prisma.activity.findMany({ where, select: { type: true, quantity: true } });
  const summary = { PLANTIO: 0, COLHEITA: 0, APLICACAO: 0, total: items.length, quantityTotal: 0 };

  items.forEach((item) => {
    summary[item.type] += 1;
    summary.quantityTotal += item.quantity || 0;
  });

  res.status(200).json({ summary });
});

app.get("/reports/activities-by-crop", authRequired, async (req, res) => {
  const where = { cropId: { not: null } };

  if (!isPrivileged(req.user)) {
    where.farm = { ownerId: req.user.sub };
  }

  const items = await prisma.activity.findMany({
    where,
    include: { crop: { select: { id: true, name: true } } }
  });

  const map = new Map();

  items.forEach((item) => {
    const key = item.crop?.id || "sem-cultura";
    if (!map.has(key)) {
      map.set(key, { cropId: key, cropName: item.crop?.name || "Sem cultura", total: 0 });
    }

    map.get(key).total += 1;
  });

  res.status(200).json({ items: Array.from(map.values()) });
});

app.get("/operational-records", authRequired, async (req, res) => {
  const where = {};

  if (!isPrivileged(req.user)) {
    where.createdById = req.user.sub;
  }

  if (req.query.category) {
    where.category = String(req.query.category).trim().toUpperCase();
  }

  if (req.query.subtype) {
    where.subtype = String(req.query.subtype).trim().toUpperCase();
  }

  if (req.query.status) {
    where.status = String(req.query.status).trim().toUpperCase();
  }

  if (req.query.farmId) {
    const farmId = String(req.query.farmId).trim();
    const access = await canAccessFarm(farmId, req.user);

    if (!access.allowed) {
      res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Fazenda não encontrada" : "Acesso negado" });
      return;
    }

    where.farmId = farmId;
  }

  const items = await prisma.operationalRecord.findMany({
    where,
    include: {
      farm: { select: { id: true, name: true, ownerId: true } },
      plot: { select: { id: true, name: true } },
      crop: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true, role: true } }
    },
    orderBy: [{ eventAt: "desc" }, { createdAt: "desc" }]
  });

  res.status(200).json({ items });
});

app.post("/operational-records", authRequired, async (req, res) => {
  try {
    const category = String(req.body?.category || "").trim().toUpperCase();
    const subtype = String(req.body?.subtype || "").trim().toUpperCase();
    const title = String(req.body?.title || "").trim();
    const status = String(req.body?.status || "OPEN").trim().toUpperCase();
    const eventAt = parseOptionalDate(req.body?.eventAt, "eventAt") || new Date();
    const dueAt = parseOptionalDate(req.body?.dueAt, "dueAt");
    const data = normalizeRecordData(req.body?.data);

    if (!category || !subtype || !title) {
      res.status(400).json({ error: "category, subtype e title são obrigatórios" });
      return;
    }

    const relations = await validateRecordRelations(req.body || {}, req.user);
    const item = await prisma.operationalRecord.create({
      data: {
        category,
        subtype,
        title,
        status,
        eventAt,
        dueAt,
        data,
        ...relations,
        createdById: req.user.sub
      },
      include: {
        farm: { select: { id: true, name: true, ownerId: true } },
        plot: { select: { id: true, name: true } },
        crop: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true, role: true } }
      }
    });

    res.status(201).json({ item });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.put("/operational-records/:id", authRequired, async (req, res) => {
  try {
    const access = await canAccessRecord(req.params.id, req.user);

    if (!access.allowed) {
      res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Registro não encontrado" : "Acesso negado" });
      return;
    }

    const data = {};

    if (req.body?.category !== undefined) {
      data.category = String(req.body.category || "").trim().toUpperCase();
    }

    if (req.body?.subtype !== undefined) {
      data.subtype = String(req.body.subtype || "").trim().toUpperCase();
    }

    if (req.body?.title !== undefined) {
      data.title = String(req.body.title || "").trim();
    }

    if (req.body?.status !== undefined) {
      data.status = String(req.body.status || "OPEN").trim().toUpperCase();
    }

    if (req.body?.eventAt !== undefined) {
      data.eventAt = parseOptionalDate(req.body.eventAt, "eventAt") || new Date();
    }

    if (req.body?.dueAt !== undefined) {
      data.dueAt = parseOptionalDate(req.body.dueAt, "dueAt");
    }

    if (req.body?.data !== undefined) {
      data.data = normalizeRecordData(req.body.data);
    }

    if (!data.category && req.body?.category !== undefined) {
      res.status(400).json({ error: "category inválida" });
      return;
    }

    if (!data.subtype && req.body?.subtype !== undefined) {
      res.status(400).json({ error: "subtype inválido" });
      return;
    }

    if (!data.title && req.body?.title !== undefined) {
      res.status(400).json({ error: "title inválido" });
      return;
    }

    if (req.body?.farmId !== undefined || req.body?.plotId !== undefined || req.body?.cropId !== undefined) {
      Object.assign(data, await validateRecordRelations({
        farmId: req.body?.farmId,
        plotId: req.body?.plotId,
        cropId: req.body?.cropId
      }, req.user));
    }

    const item = await prisma.operationalRecord.update({
      where: { id: req.params.id },
      data,
      include: {
        farm: { select: { id: true, name: true, ownerId: true } },
        plot: { select: { id: true, name: true } },
        crop: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true, role: true } }
      }
    });

    res.status(200).json({ item });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete("/operational-records/:id", authRequired, async (req, res) => {
  const access = await canAccessRecord(req.params.id, req.user);

  if (!access.allowed) {
    res.status(access.reason === "not_found" ? 404 : 403).json({ error: access.reason === "not_found" ? "Registro não encontrado" : "Acesso negado" });
    return;
  }

  await prisma.operationalRecord.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

async function buildOperationalDashboard(user) {
  const where = isPrivileged(user) ? {} : { createdById: user.sub };
  const [records, farms, plots, crops, activities] = await Promise.all([
    prisma.operationalRecord.findMany({
      where,
      include: {
        farm: { select: { id: true, name: true } },
        plot: { select: { id: true, name: true } },
        crop: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } }
      },
      orderBy: [{ eventAt: "desc" }, { createdAt: "desc" }]
    }),
    prisma.farm.findMany({ where: isPrivileged(user) ? {} : { ownerId: user.sub } }),
    prisma.plot.findMany({ where: isPrivileged(user) ? {} : { farm: { ownerId: user.sub } } }),
    prisma.crop.findMany(),
    prisma.activity.findMany({ where: isPrivileged(user) ? {} : { farm: { ownerId: user.sub } } })
  ]);

  const now = new Date();
  const soon = addDays(now, 7);
  const expirySoon = addDays(now, 30);
  const byCategory = {};
  const alerts = [];
  const finance = { payable: 0, receivable: 0, expense: 0, revenue: 0, financing: 0, balance: 0 };
  const profitability = [];

  for (const record of records) {
    byCategory[record.category] = (byCategory[record.category] || 0) + 1;
    const data = record.data || {};

    if (record.category === "STOCK") {
      const quantity = numberFromData(data, ["quantity", "quantidade"]);
      const minQuantity = numberFromData(data, ["minQuantity", "estoqueMinimo"]);

      if (minQuantity > 0 && quantity <= minQuantity) {
        alerts.push({ type: "STOCK_LOW", title: record.title, message: `Estoque baixo: ${quantity} ${data.unit || ""}`.trim(), recordId: record.id });
      }

      const expiryDate = safeOptionalDate(data.expiryDate || data.validade);
      if (expiryDate && expiryDate <= expirySoon) {
        alerts.push({ type: "STOCK_EXPIRING", title: record.title, message: `Validade próxima: ${expiryDate.toISOString().slice(0, 10)}`, recordId: record.id });
      }
    }

    if (record.category === "FINANCE") {
      const amount = numberFromData(data, ["amount", "valor"]);
      const flowType = String(data.flowType || record.subtype).toLowerCase();

      if (flowType.includes("receivable") || flowType.includes("receber") || flowType.includes("revenue") || flowType.includes("receita")) {
        finance.receivable += amount;
      } else if (flowType.includes("payable") || flowType.includes("pagar")) {
        finance.payable += amount;
      } else if (flowType.includes("financing") || flowType.includes("financiamento")) {
        finance.financing += amount;
      } else if (flowType.includes("revenue") || flowType.includes("receita")) {
        finance.revenue += amount;
      } else {
        finance.expense += amount;
      }
    }

    if (record.category === "PROFITABILITY") {
      const revenue = numberFromData(data, ["revenue", "receita"]);
      const costs = numberFromData(data, ["costs", "custos"]);
      profitability.push({
        title: record.title,
        plot: record.plot?.name || data.plotName || "-",
        production: numberFromData(data, ["production", "producao"]),
        revenue,
        costs,
        netProfit: revenue - costs
      });
    }

    if (record.dueAt && record.status !== "DONE" && record.dueAt <= soon) {
      alerts.push({
        type: "DUE_SOON",
        title: record.title,
        message: `${record.subtype} vence em ${record.dueAt.toISOString().slice(0, 10)}`,
        recordId: record.id
      });
    }
  }

  finance.balance = finance.receivable + finance.revenue - finance.payable - finance.expense - finance.financing;

  return {
    totals: {
      farms: farms.length,
      plots: plots.length,
      crops: crops.length,
      activities: activities.length,
      operationalRecords: records.length
    },
    byCategory,
    finance,
    profitability,
    alerts: alerts.slice(0, 30),
    recentRecords: records.slice(0, 20)
  };
}

app.get("/dashboard/operational", authRequired, async (req, res) => {
  const dashboard = await buildOperationalDashboard(req.user);
  res.status(200).json(dashboard);
});

app.get("/reports/operational", authRequired, async (req, res) => {
  const dashboard = await buildOperationalDashboard(req.user);
  res.status(200).json({ generatedAt: new Date().toISOString(), dashboard });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Erro interno do servidor" });
});

app.listen(port, async () => {
  try {
    await prisma.$connect();
    await seedInitialAdmin();
  } catch (error) {
    console.error("Falha ao preparar backend na inicialização:", error.message);
    if (nodeEnv === "production") {
      process.exit(1);
    }
  }

  console.log(`Backend running on port ${port}`);
});
