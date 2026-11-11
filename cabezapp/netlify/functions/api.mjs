// CabezApp API: one JSON document in Netlify Blobs holds everything.
// Public routes are for the clients (los colegas); /api/admin/* needs the ADMIN_KEY.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const KEY = "db";
const TZ = "Europe/Madrid";
const ACTIVE = ["pendiente", "confirmada"];

const emptyDb = () => ({
  settings: {
    cutsPerBono: 5,
    bonoPrice: 25,
    loosePrice: 6,
    adminPhone: "",
    confirmText:
      "Aviso legal: no te garantizamos que no te dibujemos un pene con la maquinilla. Eso sí, el degradado te va a quedar de lujo.",
  },
  availability: {}, // { "20261112": ["1700","1800"] }
  clients: [], // {id, token, name, phone, bonos:[{id, date, cuts, price}], used, createdAt}
  citas: [], // {id, clientId, d, h, style, note, status, createdAt, loose}
  reviews: [], // {id, clientId, stars, text, date, hidden}
});

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const bad = (msg, status = 400) => json({ error: msg }, status);
const id = (n = 6) => crypto.randomBytes(n).toString("base64url");

function nowParts() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return { d: p.year + p.month + p.day, h: (p.hour === "24" ? "00" : p.hour) + p.minute };
}
const isPast = (d, h) => {
  const n = nowParts();
  return d < n.d || (d === n.d && h <= n.h);
};

const normPhone = (p) => {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && /^[6789]/.test(d)) d = "34" + d;
  return d.length >= 10 && d.length <= 15 ? d : "";
};
const clean = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

const totalCuts = (c) => c.bonos.reduce((a, b) => a + b.cuts, 0);
const remaining = (c) => Math.max(0, totalCuts(c) - c.used);

function takenSlots(db, exceptId) {
  const s = new Set();
  db.citas.forEach((c) => { if ((ACTIVE.includes(c.status) || c.status === "hecha") && c.id !== exceptId) s.add(c.d + c.h); });
  return s;
}
function openAvailability(db) {
  const taken = takenSlots(db);
  const out = {};
  Object.keys(db.availability).sort().forEach((d) => {
    const hs = (db.availability[d] || []).filter((h) => !isPast(d, h) && !taken.has(d + h)).sort();
    if (hs.length) out[d] = hs;
  });
  return out;
}
function publicReviews(db) {
  const byId = Object.fromEntries(db.clients.map((c) => [c.id, c]));
  const list = db.reviews
    .filter((r) => !r.hidden && byId[r.clientId])
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({ id: r.id, name: byId[r.clientId].name.split(" ")[0], stars: r.stars, text: r.text, date: r.date }));
  const avg = list.length ? list.reduce((a, r) => a + r.stars, 0) / list.length : 0;
  return { list: list.slice(0, 30), avg: Math.round(avg * 10) / 10, count: list.length };
}
function publicSettings(db) {
  const { cutsPerBono, bonoPrice, loosePrice, adminPhone } = db.settings;
  return { cutsPerBono, bonoPrice, loosePrice, adminPhone };
}
function clientView(db, c) {
  return {
    name: c.name,
    phoneSet: !!c.phone,
    total: totalCuts(c),
    used: c.used,
    remaining: remaining(c),
    bonos: c.bonos.length,
    citas: db.citas
      .filter((x) => x.clientId === c.id)
      .sort((a, b) => (b.d + b.h).localeCompare(a.d + a.h))
      .slice(0, 20)
      .map(({ id, d, h, style, status, loose }) => ({ id, d, h, style, status, loose })),
    myReview: db.reviews.find((r) => r.clientId === c.id) || null,
  };
}

// ---------- storage with optimistic concurrency ----------
async function load(store) {
  const r = await store.getWithMetadata(KEY, { type: "json", consistency: "strong" });
  return r ? { db: { ...emptyDb(), ...r.data }, etag: r.etag } : { db: emptyDb(), etag: null };
}
async function mutate(store, fn) {
  for (let i = 0; i < 5; i++) {
    const { db, etag } = await load(store);
    const result = fn(db);
    if (result && result.error) return result;
    const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const w = await store.setJSON(KEY, db, opts);
    if (w.modified) return { db, result };
  }
  return { error: "Hay mucho lío ahora mismo, prueba otra vez", status: 409 };
}

// ---------- handlers ----------
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const store = getStore({ name: "cabezapp", consistency: "strong" });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return bad("Datos no válidos"); }
  }

  // ----- public -----
  if (path === "public" && req.method === "GET") {
    const { db } = await load(store);
    return json({ settings: publicSettings(db), availability: openAvailability(db), reviews: publicReviews(db) });
  }

  if (path === "me" && req.method === "GET") {
    const { db } = await load(store);
    const c = db.clients.find((x) => x.token === url.searchParams.get("t"));
    if (!c) return bad("Este enlace no existe. Pídele uno nuevo a Cabezas.", 404);
    return json({ me: clientView(db, c), settings: publicSettings(db), availability: openAvailability(db), reviews: publicReviews(db) });
  }

  if (path === "request" && req.method === "POST") {
    const d = String(body.d || ""), h = String(body.h || "");
    if (!/^\d{8}$/.test(d) || !/^\d{4}$/.test(h)) return bad("Elige día y hora");
    const style = clean(body.style, 40) || "Lo de siempre";
    const note = clean(body.note, 200);
    const out = await mutate(store, (db) => {
      let c = body.t ? db.clients.find((x) => x.token === body.t) : null;
      if (body.t && !c) return { error: "Enlace no válido", status: 404 };
      if (!c) {
        const name = clean(body.name, 40), phone = normPhone(body.phone);
        if (name.length < 2) return { error: "Pon tu nombre" };
        if (!phone) return { error: "Pon un móvil válido (ej. 600 123 456)" };
        c = db.clients.find((x) => x.phone === phone);
        if (!c) {
          c = { id: id(), token: id(9), name, phone, bonos: [], used: 0, createdAt: new Date().toISOString() };
          db.clients.push(c);
        }
      } else if (!c.phone && body.phone) {
        const phone = normPhone(body.phone);
        if (phone) c.phone = phone;
      }
      if (!(db.availability[d] || []).includes(h) || isPast(d, h)) return { error: "Esa hora ya no está libre, elige otra", status: 409 };
      if (takenSlots(db).has(d + h)) return { error: "Te la han quitado, elige otra hora", status: 409 };
      const open = db.citas.filter((x) => x.clientId === c.id && ACTIVE.includes(x.status) && !isPast(x.d, x.h));
      if (open.length >= 2) return { error: "Ya tienes 2 citas pedidas. Espera a que pasen o cancela una." };
      const cita = { id: id(), clientId: c.id, d, h, style, note, status: "pendiente", createdAt: new Date().toISOString() };
      db.citas.push(cita);
      return { cita };
    });
    if (out.error) return bad(out.error, out.status || 400);
    return json({ ok: true, cita: out.result.cita });
  }

  if (path === "cancel" && req.method === "POST") {
    const out = await mutate(store, (db) => {
      const c = db.clients.find((x) => x.token === body.t);
      const cita = c && db.citas.find((x) => x.id === body.id && x.clientId === c.id);
      if (!cita || !ACTIVE.includes(cita.status)) return { error: "No se puede cancelar" };
      cita.status = "cancelada";
      cita.cancelledBy = "cliente";
    });
    if (out.error) return bad(out.error);
    return json({ ok: true });
  }

  if (path === "review" && req.method === "POST") {
    const stars = Math.round(Number(body.stars));
    const text = clean(body.text, 280);
    if (!(stars >= 1 && stars <= 5)) return bad("Elige de 1 a 5 estrellas");
    const out = await mutate(store, (db) => {
      const c = db.clients.find((x) => x.token === body.t);
      if (!c) return { error: "Enlace no válido", status: 404 };
      let r = db.reviews.find((x) => x.clientId === c.id);
      if (!r) { r = { id: id(), clientId: c.id, hidden: false }; db.reviews.push(r); }
      Object.assign(r, { stars, text, date: new Date().toISOString() });
    });
    if (out.error) return bad(out.error, out.status || 400);
    return json({ ok: true });
  }

  // ----- admin -----
  if (path.startsWith("admin")) {
    const key = req.headers.get("x-admin-key") || "";
    const real = process.env.ADMIN_KEY || "";
    const ok = real && key.length === real.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(real));
    if (!ok) return bad("Clave de admin incorrecta", 401);

    const adminView = (db) => ({
      ...db,
      clients: db.clients.map((c) => ({ ...c, total: totalCuts(c), remaining: remaining(c) })),
      open: openAvailability(db),
    });

    if (path === "admin" && req.method === "GET") {
      const { db } = await load(store);
      return json(adminView(db));
    }

    const action = path.split("/")[1];
    const out = await mutate(store, (db) => {
      const client = (cid) => db.clients.find((x) => x.id === cid);
      const cita = db.citas.find((x) => x.id === body.id);
      switch (action) {
        case "availability": {
          if (!/^\d{8}$/.test(body.d)) return { error: "Día no válido" };
          const hs = [...new Set((body.hours || []).filter((h) => /^\d{4}$/.test(h)))].sort();
          if (hs.length) db.availability[body.d] = hs; else delete db.availability[body.d];
          const today = nowParts().d;
          Object.keys(db.availability).forEach((d) => { if (d < today) delete db.availability[d]; });
          return;
        }
        case "confirm":
          if (!cita) return { error: "Cita no encontrada" };
          cita.status = "confirmada"; cita.confirmedAt = new Date().toISOString(); return;
        case "reject":
          if (!cita) return { error: "Cita no encontrada" };
          cita.status = "rechazada"; return;
        case "cancel":
          if (!cita) return { error: "Cita no encontrada" };
          cita.status = "cancelada"; cita.cancelledBy = "admin"; return;
        case "done": {
          if (!cita) return { error: "Cita no encontrada" };
          if (cita.status === "hecha") return;
          const c = client(cita.clientId);
          if (c && remaining(c) > 0) { c.used += 1; cita.loose = false; } else cita.loose = true;
          cita.status = "hecha"; cita.doneAt = new Date().toISOString(); return;
        }
        case "undo-done": {
          if (!cita || cita.status !== "hecha") return { error: "No está marcada como hecha" };
          const c = client(cita.clientId);
          if (c && !cita.loose && c.used > 0) c.used -= 1;
          cita.status = "confirmada"; delete cita.loose; return;
        }
        case "add-client": {
          const name = clean(body.name, 40), phone = normPhone(body.phone);
          if (name.length < 2) return { error: "Pon el nombre" };
          if (body.phone && !phone) return { error: "Móvil no válido" };
          if (phone && db.clients.some((x) => x.phone === phone)) return { error: "Ya hay un cliente con ese móvil" };
          const c = { id: id(), token: id(9), name, phone, bonos: [], used: 0, createdAt: new Date().toISOString() };
          if (body.withBono) c.bonos.push({ id: id(), date: new Date().toISOString(), cuts: db.settings.cutsPerBono, price: db.settings.bonoPrice });
          db.clients.push(c);
          return { client: c };
        }
        case "edit-client": {
          const c = client(body.id);
          if (!c) return { error: "Cliente no encontrado" };
          if (body.name !== undefined) { const n = clean(body.name, 40); if (n.length < 2) return { error: "Pon el nombre" }; c.name = n; }
          if (body.phone !== undefined) {
            const p = normPhone(body.phone);
            if (body.phone && !p) return { error: "Móvil no válido" };
            if (p && db.clients.some((x) => x.phone === p && x.id !== c.id)) return { error: "Ese móvil ya es de otro cliente" };
            c.phone = p;
          }
          return;
        }
        case "add-bono": {
          const c = client(body.id);
          if (!c) return { error: "Cliente no encontrado" };
          c.bonos.push({ id: id(), date: new Date().toISOString(), cuts: db.settings.cutsPerBono, price: db.settings.bonoPrice });
          return;
        }
        case "remove-bono": {
          const c = client(body.id);
          if (!c) return { error: "Cliente no encontrado" };
          const i = c.bonos.findIndex((b) => b.id === body.bonoId);
          if (i < 0) return { error: "Bono no encontrado" };
          c.bonos.splice(i, 1);
          return;
        }
        case "adjust": {
          const c = client(body.id);
          if (!c) return { error: "Cliente no encontrado" };
          const next = c.used + (body.delta > 0 ? 1 : -1);
          if (next < 0 || next > totalCuts(c)) return { error: "No se puede" };
          c.used = next; return;
        }
        case "delete-client": {
          const c = client(body.id);
          if (!c) return { error: "Cliente no encontrado" };
          db.clients = db.clients.filter((x) => x.id !== c.id);
          db.citas = db.citas.filter((x) => x.clientId !== c.id);
          db.reviews = db.reviews.filter((x) => x.clientId !== c.id);
          return;
        }
        case "review-visibility": {
          const r = db.reviews.find((x) => x.id === body.id);
          if (!r) return { error: "Reseña no encontrada" };
          r.hidden = !!body.hidden; return;
        }
        case "settings": {
          const s = db.settings;
          const n = (v, min, max) => Math.min(max, Math.max(min, Number(v)));
          if (body.cutsPerBono !== undefined) s.cutsPerBono = Math.round(n(body.cutsPerBono, 1, 20));
          if (body.bonoPrice !== undefined) s.bonoPrice = n(body.bonoPrice, 0, 500);
          if (body.loosePrice !== undefined) s.loosePrice = n(body.loosePrice, 0, 100);
          if (body.adminPhone !== undefined) {
            const p = normPhone(body.adminPhone);
            if (body.adminPhone && !p) return { error: "Tu móvil no es válido" };
            s.adminPhone = p;
          }
          if (body.confirmText !== undefined) s.confirmText = String(body.confirmText).slice(0, 400);
          return;
        }
        default:
          return { error: "Acción desconocida", status: 404 };
      }
    });
    if (out.error) return bad(out.error, out.status || 400);
    return json({ ok: true, result: out.result || null, db: adminView(out.db) });
  }

  return bad("No encontrado", 404);
};

export const config = { path: "/api/*" };
