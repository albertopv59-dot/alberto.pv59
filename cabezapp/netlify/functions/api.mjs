// CabezApp API. One JSON document in Netlify Blobs holds everything.
// Flow: el colega pide corte para una semana -> Cabezas le pasa huecos -> el colega pilla uno.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const KEY = "db";
const TZ = "Europe/Madrid";
const OPEN = ["pedida", "huecos", "confirmada"];
const PREFS = ["igual", "tardes", "mananas", "finde"];

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
  clients: [], // {id, token, name, phone, bonos:[{id,date,cuts,price}], used, createdAt}
  citas: [], // {id, clientId, week, pref, style, note, status, offer:[ "YYYYMMDDHHMM" ], d, h, createdAt}
  reviews: [], // {id, clientId, stars, text, date, hidden}
});

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
const bad = (msg, status = 400) => json({ error: msg }, status);
const id = (n = 6) => crypto.randomBytes(n).toString("base64url");
const clean = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

// ---------- dates (always Madrid time) ----------
function nowParts() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return { d: p.year + p.month + p.day, h: (p.hour === "24" ? "00" : p.hour) + p.minute };
}
const toUTC = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)));
const fromUTC = (x) => x.getUTCFullYear() + String(x.getUTCMonth() + 1).padStart(2, "0") + String(x.getUTCDate()).padStart(2, "0");
const addDays = (d, n) => { const x = toUTC(d); x.setUTCDate(x.getUTCDate() + n); return fromUTC(x); };
const mondayOf = (d) => addDays(d, -((toUTC(d).getUTCDay() + 6) % 7));
const weeks = () => { const cur = mondayOf(nowParts().d); return { current: cur, next: addDays(cur, 7) }; };
const isPast = (d, h) => { const n = nowParts(); return d < n.d || (d === n.d && h <= n.h); };

const normPhone = (p) => {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && /^[6789]/.test(d)) d = "34" + d;
  return d.length >= 10 && d.length <= 15 ? d : "";
};
const totalCuts = (c) => c.bonos.reduce((a, b) => a + b.cuts, 0);
const remaining = (c) => Math.max(0, totalCuts(c) - c.used);

function takenSlots(db) {
  const s = new Set();
  db.citas.forEach((c) => { if ((c.status === "confirmada" || c.status === "hecha") && c.d) s.add(c.d + c.h); });
  return s;
}
const slotFree = (db, slot, taken = takenSlots(db)) => {
  const d = slot.slice(0, 8), h = slot.slice(8);
  return (db.availability[d] || []).includes(h) && !isPast(d, h) && !taken.has(slot);
};
// A request counts as open while it has no time yet, or its time is still ahead
const isOpen = (c) => OPEN.includes(c.status) && !(c.status === "confirmada" && isPast(c.d, c.h));

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
  const { cutsPerBono, bonoPrice, loosePrice, adminPhone, confirmText } = db.settings;
  return { cutsPerBono, bonoPrice, loosePrice, adminPhone, confirmText };
}
function clientView(db, c) {
  const taken = takenSlots(db);
  return {
    name: c.name,
    total: totalCuts(c),
    used: c.used,
    remaining: remaining(c),
    bonos: c.bonos.length,
    citas: db.citas
      .filter((x) => x.clientId === c.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((x) => ({
        id: x.id, week: x.week, pref: x.pref, style: x.style, status: x.status, d: x.d || null, h: x.h || null, loose: !!x.loose,
        open: isOpen(x),
        offer: x.status === "huecos" ? (x.offer || []).filter((s) => slotFree(db, s, taken)) : [],
      })),
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
    const w = await store.setJSON(KEY, db, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (w.modified) return { db, result };
  }
  return { error: "Hay mucho lío ahora mismo, prueba otra vez", status: 409 };
}

// ---------- handler ----------
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "");

  // Installable app: the manifest opens the page it was installed from
  if (path === "manifest") {
    const s = url.searchParams.get("start") || "/";
    const start = /^\/(c\/[A-Za-z0-9_-]{6,40}|admin)?$/.test(s) ? s : "/";
    return json({
      name: start === "/admin" ? "CabezApp Admin" : "CabezApp",
      short_name: "CabezApp",
      description: "Pilla tu corte con Cabezas",
      id: start,
      start_url: start,
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0B0E17",
      theme_color: "#0B0E17",
      lang: "es",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }, 200, { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" });
  }

  const store = getStore({ name: "cabezapp", consistency: "strong" });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return bad("Datos no válidos"); }
  }

  // ----- public -----
  if (path === "public" && req.method === "GET") {
    const { db } = await load(store);
    return json({ settings: publicSettings(db), reviews: publicReviews(db), weeks: weeks() });
  }

  if (path === "me" && req.method === "GET") {
    const { db } = await load(store);
    const c = db.clients.find((x) => x.token === url.searchParams.get("t"));
    if (!c) return bad("Este enlace no existe. Pídele uno nuevo a Cabezas.", 404);
    return json({ me: clientView(db, c), settings: publicSettings(db), reviews: publicReviews(db), weeks: weeks() });
  }

  if (path === "request" && req.method === "POST") {
    const w = weeks();
    const week = String(body.week || "");
    if (week !== w.current && week !== w.next) return bad("Elige esta semana o la que viene");
    const pref = PREFS.includes(body.pref) ? body.pref : "igual";
    const style = clean(body.style, 40) || "Degradado";
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
      }
      if (db.citas.some((x) => x.clientId === c.id && isOpen(x))) return { error: "Ya tienes un corte pedido. Espera a que Cabezas te pase huecos." };
      const cita = { id: id(), clientId: c.id, week, pref, style, note, status: "pedida", offer: [], createdAt: new Date().toISOString() };
      db.citas.push(cita);
      return { cita, token: c.token };
    });
    if (out.error) return bad(out.error, out.status || 400);
    return json({ ok: true, token: out.result.token });
  }

  if (path === "pick" && req.method === "POST") {
    const slot = String(body.slot || "");
    if (!/^\d{12}$/.test(slot)) return bad("Elige un hueco");
    const out = await mutate(store, (db) => {
      const c = db.clients.find((x) => x.token === body.t);
      const cita = c && db.citas.find((x) => x.id === body.id && x.clientId === c.id);
      if (!cita || cita.status !== "huecos") return { error: "Esta petición ya no admite huecos" };
      if (!(cita.offer || []).includes(slot)) return { error: "Ese hueco no te lo han ofrecido" };
      if (!slotFree(db, slot)) return { error: "Te lo han pillado antes. Elige otro.", status: 409 };
      cita.d = slot.slice(0, 8); cita.h = slot.slice(8);
      cita.status = "confirmada"; cita.pickedAt = new Date().toISOString();
      return { cita };
    });
    if (out.error) return bad(out.error, out.status || 400);
    return json({ ok: true, d: out.result.cita.d, h: out.result.cita.h });
  }

  if (path === "cancel" && req.method === "POST") {
    const out = await mutate(store, (db) => {
      const c = db.clients.find((x) => x.token === body.t);
      const cita = c && db.citas.find((x) => x.id === body.id && x.clientId === c.id);
      if (!cita || !OPEN.includes(cita.status)) return { error: "No se puede cancelar" };
      cita.status = "cancelada"; cita.cancelledBy = "cliente";
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
      weeks: weeks(),
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
        case "offer": {
          if (!cita || !["pedida", "huecos"].includes(cita.status)) return { error: "Esta petición ya no está abierta" };
          const taken = takenSlots(db);
          const slots = [...new Set(body.slots || [])].filter((s) => /^\d{12}$/.test(s) && slotFree(db, s, taken)).sort();
          if (!slots.length) return { error: "Elige al menos un hueco libre" };
          cita.offer = slots; cita.status = "huecos"; cita.offeredAt = new Date().toISOString();
          return;
        }
        case "assign": {
          if (!cita || !["pedida", "huecos"].includes(cita.status)) return { error: "Esta petición ya no está abierta" };
          const s = String(body.slot || "");
          if (!/^\d{12}$/.test(s) || !slotFree(db, s)) return { error: "Ese hueco no está libre" };
          cita.d = s.slice(0, 8); cita.h = s.slice(8); cita.status = "confirmada"; cita.pickedAt = new Date().toISOString();
          return;
        }
        case "reject":
          if (!cita) return { error: "Petición no encontrada" };
          cita.status = "rechazada"; return;
        case "cancel":
          if (!cita) return { error: "Petición no encontrada" };
          cita.status = "cancelada"; cita.cancelledBy = "admin"; return;
        case "sent":
          if (!cita) return { error: "Petición no encontrada" };
          cita.confirmSent = true; return;
        case "done": {
          if (!cita || cita.status !== "confirmada") return { error: "Solo se marcan cortes confirmados" };
          const c = client(cita.clientId);
          if (c && remaining(c) > 0) { c.used += 1; cita.loose = false; } else cita.loose = true;
          cita.status = "hecha"; cita.doneAt = new Date().toISOString(); return;
        }
        case "undo-done": {
          if (!cita || cita.status !== "hecha") return { error: "No está marcado como hecho" };
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
          c.used = Math.min(c.used, totalCuts(c));
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
        case "merge": {
          // Same person twice: move everything from `id` into `into` and drop `id`
          const from = client(body.id), into = client(body.into);
          if (!from || !into || from.id === into.id) return { error: "Elige otro cliente" };
          into.bonos.push(...from.bonos);
          into.used += from.used;
          if (!into.phone && from.phone) into.phone = from.phone;
          db.citas.forEach((x) => { if (x.clientId === from.id) x.clientId = into.id; });
          const keep = db.reviews.find((r) => r.clientId === into.id);
          db.reviews = db.reviews.filter((r) => r.clientId !== from.id || !keep);
          db.reviews.forEach((r) => { if (r.clientId === from.id) r.clientId = into.id; });
          db.clients = db.clients.filter((x) => x.id !== from.id);
          return { into: into.id };
        }
        case "review-visibility": {
          const r = db.reviews.find((x) => x.id === body.id);
          if (!r) return { error: "Reseña no encontrada" };
          r.hidden = !!body.hidden; return;
        }
        case "settings": {
          const s = db.settings;
          const n = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
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
