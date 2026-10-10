import { URL } from "node:url";
import { connect, isReady, mapProgress, progress, toId, users } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const ROOMS = [
  { title: "Entrada", text: "Hay una puerta cerrada. El codigo es el ano de la independencia de Argentina.", answer: "1816" },
  { title: "Salon", text: "Un cuadro tiene numeros: 2, 4, 8. Cual es el siguiente?", answer: "16" },
  { title: "Salida", text: "Felicitaciones, escapaste. La clave final es libertad.", answer: "libertad" }
];
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { user });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/state") {
    let row = await progress().findOne({ userId });
    if (!row) {
      await progress().insertOne({ userId, room: 0, solved: [] });
      row = { room: 0, solved: [] };
    }
    const room = ROOMS[row.room] || null;
    return sendJson(res, 200, { progress: mapProgress(row), room: room ? { title: room.title, text: room.text } : null, total: ROOMS.length });
  }
  if (method === "POST" && pathname === "/api/answer") {
    const body = await readJson(req);
    const answer = String(body.answer || "").trim().toLowerCase();
    let row = await progress().findOne({ userId });
    if (!row) return sendJson(res, 400, { error: "Sin progreso" });
    const room = ROOMS[row.room];
    if (!room) return sendJson(res, 400, { error: "Ya terminaste" });
    if (answer === room.answer.toLowerCase()) {
      const next = row.room + 1;
      await progress().updateOne({ userId }, { $set: { room: next }, $push: { solved: row.room } });
      return sendJson(res, 200, { ok: true, next });
    }
    return sendJson(res, 400, { error: "Incorrecto" });
  }
  if (method === "POST" && pathname === "/api/reset") {
    await progress().updateOne({ userId }, { $set: { room: 0, solved: [] } }, { upsert: true });
    return sendJson(res, 200, { ok: true });
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Escape en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
