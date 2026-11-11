// CabezApp front-end: three screens on one page.
//   /            -> cualquiera pide cita (nombre + móvil)
//   /c/<token>   -> zona personal del colega: bono, citas, reseña
//   /admin       -> panel de Cabezas
"use strict";

const HOURS = ["1000", "1100", "1200", "1300", "1600", "1700", "1800", "1900", "2000", "2100"];
const STYLES = ["Degradado", "Lo de siempre", "Rapado", "Solo puntas", "Arreglo de barba", "Sorpréndeme"];
const LS_TOKEN = "cabezapp-token";
const LS_ADMIN = "cabezapp-admin";

const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");

// ---------- utils ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
const fromYmd = (s) => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
const hm = (h) => h.slice(0, 2) + ":" + h.slice(2);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fmt = (d, o) => d.toLocaleDateString("es-ES", o);
const longDay = (s) => cap(fmt(fromYmd(s), { weekday: "long", day: "numeric", month: "long" }));
const shortDay = (s) => cap(fmt(fromYmd(s), { weekday: "short", day: "numeric", month: "short" }));
const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isPast = (d, h) => { const x = fromYmd(d); x.setHours(+h.slice(0, 2), +h.slice(2)); return x <= new Date(); };
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const origin = () => location.origin;
const personalLink = (token) => origin() + "/c/" + token;
const wa = (phone, text) => "https://wa.me/" + (phone || "") + "?text=" + encodeURIComponent(text);

const ICON = {
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8L12 2.5Z"/></svg>',
  scissors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg>',
};
const stars = (n) => `<span class="stars" aria-label="${n} de 5">${Array.from({ length: 5 }, (_, i) => `<span style="opacity:${i < n ? 1 : .2}">${ICON.star}</span>`).join("")}</span>`;

let toastTimer;
function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}
async function copy(text, okMsg = "Copiado") {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { toast("Mantén pulsado el texto para copiarlo"); }
}

async function api(path, { method = "GET", body, admin } = {}) {
  const headers = { "content-type": "application/json" };
  if (admin) headers["x-admin-key"] = store.get(LS_ADMIN) || "";
  const r = await fetch("/api/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(data.error || "Algo ha fallado. Prueba otra vez."); e.status = r.status; throw e; }
  return data;
}

// =====================================================================
// Booking widget (shared by / and /c/<token>)
// =====================================================================
function booking(el, { availability, needContact, onDone }) {
  const s = { d: null, h: null, style: STYLES[0], note: "", name: "", phone: "", busy: false, error: "" };
  const days = Object.keys(availability).sort();

  function draw() {
    if (!days.length) {
      el.innerHTML = `<div class="card"><h3>Ahora mismo no hay huecos</h3><p class="muted" style="margin:0">Cabezas todavía no ha abierto agenda. Vuelve en un rato o escríbele.</p></div>`;
      return;
    }
    const hs = s.d ? availability[s.d] : [];
    const ready = s.d && s.h && (!needContact || (s.name.trim().length > 1 && s.phone.replace(/\D/g, "").length >= 9));
    el.innerHTML = `
      <div class="step">
        <div class="step-t"><i>1</i> Elige día</div>
        <div class="dpick">${days.map((d) => {
          const x = fromYmd(d), n = availability[d].length;
          return `<button class="dbtn${s.d === d ? " on" : ""}" data-d="${d}" aria-pressed="${s.d === d}">
            <span class="wd">${esc(fmt(x, { weekday: "short" }))}</span><span class="n">${x.getDate()}</span>
            <span class="c">${n} ${n === 1 ? "hueco" : "huecos"}</span></button>`;
        }).join("")}</div>
      </div>
      <div class="step" ${s.d ? "" : "hidden"}>
        <div class="step-t"><i>2</i> Elige hora</div>
        <div class="hours">${hs.map((h) => `<button class="chip${s.h === h ? " on" : ""}" data-h="${h}" aria-pressed="${s.h === h}">${hm(h)}</button>`).join("")}</div>
      </div>
      <div class="step" ${s.h ? "" : "hidden"}>
        <div class="step-t"><i>3</i> ¿Qué te hacemos?</div>
        <div class="pills">${STYLES.map((x) => `<button class="pill${s.style === x ? " on" : ""}" data-s="${esc(x)}" aria-pressed="${s.style === x}">${esc(x)}</button>`).join("")}</div>
        <input class="field" id="bk-note" maxlength="200" placeholder="Algo más (opcional): «que no se note el trasquilón de la última vez»" value="${esc(s.note)}">
      </div>
      ${needContact ? `<div class="step" ${s.h ? "" : "hidden"}>
        <div class="step-t"><i>4</i> ¿Quién eres?</div>
        <div class="grid2">
          <div><label class="fl" for="bk-name">Nombre</label><input class="field" id="bk-name" autocomplete="given-name" maxlength="40" value="${esc(s.name)}" placeholder="Tu nombre o mote"></div>
          <div><label class="fl" for="bk-phone">Móvil (WhatsApp)</label><input class="field" id="bk-phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(s.phone)}" placeholder="600 123 456"></div>
        </div>
        <p class="muted small" style="margin:0">Te escribimos aquí para confirmarte la cita.</p>
      </div>` : ""}
      ${s.error ? `<p class="err">${esc(s.error)}</p>` : ""}
      <button class="btn primary" id="bk-send" ${ready && !s.busy ? "" : "disabled"}>
        ${s.busy ? "Enviando…" : s.d && s.h ? `Pedir cita · ${esc(cap(fmt(fromYmd(s.d), { weekday: "long" })))} ${hm(s.h)}` : "Elige día y hora"}
      </button>`;
  }

  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || !el.contains(b)) return;
    if (b.dataset.d) { s.d = b.dataset.d; s.h = null; }
    else if (b.dataset.h) s.h = b.dataset.h;
    else if (b.dataset.s) s.style = b.dataset.s;
    else if (b.id === "bk-send") {
      s.busy = true; s.error = ""; draw();
      try {
        await onDone({ d: s.d, h: s.h, style: s.style, note: s.note, name: s.name, phone: s.phone });
        return;
      } catch (err) { s.error = err.message; s.busy = false; }
    } else return;
    draw();
  });
  el.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "bk-note") s.note = t.value;
    if (t.id === "bk-name") s.name = t.value;
    if (t.id === "bk-phone") s.phone = t.value;
    if (t.id === "bk-name" || t.id === "bk-phone") {
      const btn = $("#bk-send", el);
      const ok = s.d && s.h && s.name.trim().length > 1 && s.phone.replace(/\D/g, "").length >= 9;
      btn.disabled = !ok;
    }
  });
  draw();
}

function ticket(d, h, style, who) {
  return `<div class="ticket">
    <div class="t1"><span class="eyebrow">Solicitud enviada · pendiente de validar</span>
      <div class="bigt">${hm(h)}</div><div class="when">${esc(longDay(d))}</div></div>
    <div class="perf"></div>
    <div class="t2"><div><span>Cliente</span><b>${esc(who)}</b></div><div><span>Corte</span><b>${esc(style)}</b></div></div>
  </div>`;
}

function requestSent(el, { d, h, style, note, who, settings, link }) {
  const msg = `Ey Cabezas 💈 Te he pedido cita en CabezApp:\n📅 ${longDay(d)} a las ${hm(h)}\n✂️ ${style}` + (note ? `\n📝 ${note}` : "") + `\nSoy ${who}. ¡Valídamela!` + (link ? `\n${link}` : "");
  el.innerHTML = `
    <div><h1>¡Pedida! Ahora <em>avisa</em> a Cabezas.</h1>
    <p class="lead">Tu cita está pendiente hasta que él la valide. Mándale un WhatsApp para que la vea antes.</p></div>
    ${ticket(d, h, style, who)}
    ${settings.adminPhone
      ? `<a class="btn wa" href="${wa(settings.adminPhone, msg)}" target="_blank" rel="noopener">${ICON.wa} Avisar a Cabezas por WhatsApp</a>`
      : `<p class="muted">Cabezas verá tu solicitud en su panel.</p>`}
    <p class="muted small" style="margin:0">Cuando la valide te llegará un WhatsApp de confirmación.</p>`;
}

function reviewsBlock(reviews) {
  if (!reviews.count) return `<div class="section"><h2>Reseñas</h2><p class="empty">Todavía no hay reseñas. Sé el primero cuando te corte.</p></div>`;
  return `<div class="section">
    <div class="section-head"><h2>Lo que dicen los colegas</h2></div>
    <div class="score"><b>${reviews.avg.toFixed(1).replace(".", ",")}</b><div>${stars(Math.round(reviews.avg))}<div class="muted small">${reviews.count} ${reviews.count === 1 ? "reseña" : "reseñas"}</div></div></div>
    <div class="list">${reviews.list.map((r) => `<div class="review">
      <div class="item-row"><b class="grow">${esc(r.name)}</b>${stars(r.stars)}</div>
      ${r.text ? `<p>${esc(r.text)}</p>` : ""}</div>`).join("")}</div></div>`;
}

// =====================================================================
// /  — anyone can ask for an appointment
// =====================================================================
async function landing() {
  $("#roleTag").textContent = "";
  const saved = store.get(LS_TOKEN);
  const data = await api("public");
  const s = data.settings;
  app.innerHTML = `
    ${saved ? `<a class="btn ghost" href="/c/${esc(saved)}">Ir a mi zona (bono y citas)</a>` : ""}
    <div>
      <h1>La barbería de <em>Cabezas</em>.</h1>
      <p class="lead">Pide hora, elige el corte y listo. Si tienes bono, tu zona te dice cuántos cortes te quedan.</p>
    </div>
    <div class="bono">
      <div class="top"><div><div class="eyebrow" style="color:#C9D2EA">Bono</div>
        <div class="big">${s.cutsPerBono}<small>cortes</small></div>
        <div class="sub">${s.bonoPrice} € · sale a ${(s.bonoPrice / s.cutsPerBono).toFixed(0)} € el corte</div></div>
        <span class="sticker">Pídeselo a Cabezas</span></div>
    </div>
    <div class="section"><h2>Pide cita</h2><div id="bk"></div></div>
    ${reviewsBlock(data.reviews)}
    <footer class="foot">CabezApp · degradados con cariño desde el salón de casa</footer>`;
  booking($("#bk"), {
    availability: data.availability,
    needContact: true,
    onDone: async (b) => {
      await api("request", { method: "POST", body: b });
      requestSent(app, { ...b, who: b.name.trim(), settings: s });
      window.scrollTo(0, 0);
    },
  });
}

// =====================================================================
// /c/<token> — personal zone
// =====================================================================
const STATUS_TXT = { pendiente: "Por validar", confirmada: "Confirmada", hecha: "Hecha", rechazada: "No pudo ser", cancelada: "Cancelada" };

function punchCard(me, settings) {
  if (!me.total) {
    return `<div class="bono empty"><div class="top"><div>
      <div class="eyebrow">Tu bono</div><div class="big">0<small>cortes</small></div>
      <div class="sub muted">No tienes bono. Corte suelto: ${settings.loosePrice} €. Bono de ${settings.cutsPerBono} cortes: ${settings.bonoPrice} €.</div></div>
      <span class="sticker">Pídele uno</span></div></div>`;
  }
  const per = settings.cutsPerBono;
  // Holes of the bono in use: the one that still has cuts left (or the last one if all are spent)
  const usedInCurrent = me.remaining === 0 ? per : me.used % per;
  const extra = Math.max(0, me.remaining - (per - usedInCurrent));
  const holes = Array.from({ length: per }, (_, i) => i < usedInCurrent
    ? `<span class="hole used" title="Corte gastado">${ICON.scissors}</span>`
    : `<span class="hole">${i + 1}</span>`).join("");
  return `<div class="bono">
    <div class="top"><div>
      <div class="eyebrow" style="color:#C9D2EA">Te quedan</div>
      <div class="big">${me.remaining}<small>${me.remaining === 1 ? "corte" : "cortes"}</small></div>
      <div class="sub">Llevas ${me.used} de ${me.total}${me.bonos > 1 ? ` · ${me.bonos} bonos` : ""}</div></div>
      ${me.remaining === 0 ? `<span class="sticker">Toca renovar</span>` : me.remaining === 1 ? `<span class="sticker">Último corte</span>` : extra ? `<span class="sticker">+${extra} en otro bono</span>` : ""}
    </div>
    <div class="holes" aria-label="${usedInCurrent} de ${per} cortes gastados en este bono">${holes}</div>
  </div>`;
}

async function personal(token) {
  $("#roleTag").textContent = "Tu zona";
  let data;
  try { data = await api("me?t=" + encodeURIComponent(token)); }
  catch (e) {
    store.del(LS_TOKEN);
    app.innerHTML = `<div><h1>Enlace <em>roto</em>.</h1><p class="lead">${esc(e.message)}</p></div><a class="btn primary" href="/">Pedir cita igualmente</a>`;
    return;
  }
  store.set(LS_TOKEN, token);
  const { me, settings, availability, reviews } = data;
  const upcoming = me.citas.filter((c) => ["pendiente", "confirmada"].includes(c.status) && !isPast(c.d, c.h)).reverse();
  const history = me.citas.filter((c) => c.status === "hecha");
  const r = me.myReview;
  myStars = r ? r.stars : 0;

  app.innerHTML = `
    <div><h1>¿Qué pasa, <em>${esc(firstName(me.name))}</em>?</h1>
    <p class="lead">Aquí pides cita, ves tu bono y le pones nota a Cabezas.</p></div>
    ${punchCard(me, settings)}
    ${upcoming.length ? `<div class="section"><h2>Tus citas</h2><div class="list">${upcoming.map((c) => `
      <div class="item"><div class="item-row">
        <div class="time">${hm(c.h)}</div>
        <div class="grow"><div class="name">${esc(longDay(c.d))}</div><div class="muted small">${esc(c.style)}</div></div>
        <span class="status st-${c.status}">${STATUS_TXT[c.status]}</span></div>
        <div class="row"><button class="btn ghost sm" data-cancel="${c.id}">Cancelar cita</button></div>
      </div>`).join("")}</div></div>` : ""}
    <div class="section"><h2>Pide cita</h2><div id="bk"></div></div>
    <div class="section">
      <h2>${r ? "Tu reseña" : "Ponle nota a Cabezas"}</h2>
      <div class="card">
        <div class="starpick" id="starpick">${[1, 2, 3, 4, 5].map((n) => `<button data-star="${n}" aria-label="${n} estrellas" class="${n <= myStars ? "on" : ""}">${ICON.star}</button>`).join("")}</div>
        <textarea class="field" id="rv-text" maxlength="280" placeholder="Sé sincero. Bueno, tampoco tanto.">${esc(r ? r.text : "")}</textarea>
        <button class="btn primary" id="rv-send">${r ? "Actualizar reseña" : "Publicar reseña"}</button>
      </div>
    </div>
    ${reviewsBlock(reviews)}
    ${history.length ? `<div class="section"><h2>Historial</h2><div class="list">${history.map((c) => `
      <div class="item"><div class="item-row"><div class="grow"><b>${esc(shortDay(c.d))}</b> · ${esc(c.style)}</div>
      <span class="muted small">${c.loose ? "Suelto" : "Del bono"}</span></div></div>`).join("")}</div></div>` : ""}
    <footer class="foot">Guarda este enlace: es solo tuyo.</footer>`;

  booking($("#bk"), {
    availability,
    needContact: false,
    onDone: async (b) => {
      await api("request", { method: "POST", body: { ...b, t: token } });
      requestSent(app, { ...b, who: me.name, settings, link: null });
      app.insertAdjacentHTML("beforeend", `<a class="btn ghost" href="/c/${esc(token)}">Volver a mi zona</a>`);
      window.scrollTo(0, 0);
    },
  });

  if (personalWired) return;
  personalWired = true;
  app.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || route() !== "client") return;
    if (b.dataset.star) {
      myStars = +b.dataset.star;
      $("#starpick").querySelectorAll("button").forEach((x) => x.classList.toggle("on", +x.dataset.star <= myStars));
    } else if (b.id === "rv-send") {
      if (!myStars) return toast("Elige las estrellas", true);
      b.disabled = true;
      try { await api("review", { method: "POST", body: { t: token, stars: myStars, text: $("#rv-text").value } }); toast("Reseña publicada"); personal(token); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    } else if (b.dataset.cancel) {
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Toca otra vez para cancelar"; b.classList.add("danger"); return; }
      try { await api("cancel", { method: "POST", body: { t: token, id: b.dataset.cancel } }); toast("Cita cancelada"); personal(token); }
      catch (err) { toast(err.message, true); }
    }
  });
}
let personalWired = false;
let myStars = 0;

// =====================================================================
// /admin — Cabezas' panel
// =====================================================================
const A = { db: null, tab: "citas", week: 0, openClient: null };

function confirmMsg(c, cl, s) {
  const left = cl.remaining;
  const bono = left > 0
    ? `🎟️ Bono: te quedan ${left} ${left === 1 ? "corte" : "cortes"} (contando este)`
    : `🎟️ No te queda bono: este corte son ${s.loosePrice} €. Bono de ${s.cutsPerBono} cortes por ${s.bonoPrice} €, tú verás.`;
  return `✅ Cita CONFIRMADA en CabezApp 💈\n📅 ${longDay(c.d)} a las ${hm(c.h)}\n✂️ ${c.style}\n${bono}\n\n⚠️ ${s.confirmText}\n\nTu zona (citas, bono y reseñas):\n${personalLink(cl.token)}`;
}
const rejectMsg = (c, cl) => `Ey ${firstName(cl.name)}, el ${longDay(c.d).toLowerCase()} a las ${hm(c.h)} al final no puedo 😅 Pilla otra hora aquí:\n${personalLink(cl.token)}`;
const linkMsg = (cl) => `Ey ${firstName(cl.name)}! 💈 Esta es tu zona de CabezApp: pides cita, ves cuántos cortes te quedan del bono y me dejas reseña. Es solo tuya, guárdala:\n${personalLink(cl.token)}`;
const doneMsg = (cl, left) => `Corte hecho ✂️ ${left > 0 ? `Te ${left === 1 ? "queda" : "quedan"} ${left} ${left === 1 ? "corte" : "cortes"} del bono.` : "Bono agotado, toca renovar 🫡"}\nSi te ha gustado (o no), déjame una reseña:\n${personalLink(cl.token)}`;
const bonoMsg = (cl, s) => `Bono cargado 🎟️ ${s.cutsPerBono} cortes por ${s.bonoPrice} €. Ahora te quedan ${cl.remaining + s.cutsPerBono}. Míralo aquí:\n${personalLink(cl.token)}`;

async function adminCall(action, body) {
  try {
    const r = await api("admin/" + action, { method: "POST", body, admin: true });
    A.db = r.db;
    return r;
  } catch (e) { toast(e.message, true); throw e; }
}

async function admin() {
  $("#roleTag").textContent = "Admin";
  const qk = new URLSearchParams(location.search).get("k");
  if (qk) { store.set(LS_ADMIN, qk); history.replaceState(null, "", "/admin"); }
  if (!store.get(LS_ADMIN)) return adminLogin();
  try { A.db = await api("admin", { admin: true }); }
  catch (e) { if (e.status === 401) { store.del(LS_ADMIN); return adminLogin("Esa clave no es."); } throw e; }
  drawAdmin();
}

function adminLogin(err) {
  app.innerHTML = `<div><h1>Panel de <em>Cabezas</em></h1><p class="lead">Mete tu clave de admin. Solo hace falta una vez en este móvil.</p></div>
    <form class="card" id="login"><label class="fl" for="ak">Clave</label>
    <input class="field" id="ak" type="password" autocomplete="current-password" required>
    ${err ? `<p class="err">${esc(err)}</p>` : ""}<button class="btn primary">Entrar</button></form>`;
  $("#login").addEventListener("submit", (e) => { e.preventDefault(); store.set(LS_ADMIN, $("#ak").value.trim()); admin(); });
}

const clientById = (id) => A.db.clients.find((c) => c.id === id) || { name: "Borrado", remaining: 0, token: "", phone: "" };

function drawAdmin() {
  const db = A.db;
  const pending = db.citas.filter((c) => c.status === "pendiente" && !isPast(c.d, c.h));
  const tabs = [["citas", "Citas", pending.length], ["horario", "Horario"], ["clientes", "Clientes"], ["resenas", "Reseñas"], ["ajustes", "Ajustes"]];
  app.innerHTML = `
    <nav class="tabs" aria-label="Secciones">${tabs.map(([k, l, n]) => `<button class="tab${A.tab === k ? " on" : ""}" data-tab="${k}">${l}${n ? `<span class="badge">${n}</span>` : ""}</button>`).join("")}</nav>
    <div id="pane"></div>`;
  ({ citas: paneCitas, horario: paneHorario, clientes: paneClientes, resenas: paneResenas, ajustes: paneAjustes })[A.tab]($("#pane"));
}

function citaCard(c, actions) {
  const cl = clientById(c.clientId);
  return `<div class="item">
    <div class="item-row"><div class="time">${hm(c.h)}</div>
      <div class="grow"><div class="name">${esc(cl.name)}</div><div class="muted small">${esc(shortDay(c.d))} · ${esc(c.style)} · ${cl.remaining > 0 ? `bono: ${cl.remaining}` : "sin bono"}</div></div>
      <span class="status st-${c.status}">${STATUS_TXT[c.status]}</span></div>
    ${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}
    ${actions ? `<div class="row">${actions}</div>` : ""}
  </div>`;
}

function paneCitas(el) {
  const db = A.db, s = db.settings;
  const sort = (a, b) => (a.d + a.h).localeCompare(b.d + b.h);
  const pending = db.citas.filter((c) => c.status === "pendiente" && !isPast(c.d, c.h)).sort(sort);
  const confirmed = db.citas.filter((c) => c.status === "confirmada").sort(sort);
  const done = db.citas.filter((c) => c.status === "hecha").sort(sort).reverse().slice(0, 8);
  const lowBono = db.clients.filter((c) => c.total > 0 && c.remaining <= 1);
  const money = db.clients.reduce((a, c) => a + c.bonos.reduce((x, b) => x + b.price, 0), 0);

  el.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${pending.length}</b><span>Por validar</span></div>
      <div class="stat"><b>${confirmed.length}</b><span>Confirmadas</span></div>
      <div class="stat"><b>${money}€</b><span>En bonos</span></div>
    </div>
    ${!s.adminPhone ? `<div class="card"><b>Pon tu WhatsApp en Ajustes</b><span class="muted small">Así los colegas te pueden avisar al pedir cita.</span><button class="btn sm ghost" data-tab="ajustes">Ir a Ajustes</button></div>` : ""}
    <div class="section"><h2>Por validar</h2><div class="list">${pending.length ? pending.map((c) => {
      const cl = clientById(c.clientId);
      return citaCard(c, cl.phone
        ? `<a class="btn ok sm" href="${wa(cl.phone, confirmMsg(c, cl, s))}" target="_blank" rel="noopener" data-act="confirm" data-id="${c.id}">${ICON.wa} Validar y avisar</a>
           <a class="btn ghost sm" href="${wa(cl.phone, rejectMsg(c, cl))}" target="_blank" rel="noopener" data-act="reject" data-id="${c.id}">No puedo</a>`
        : `<button class="btn ok sm" data-act="confirm" data-id="${c.id}">Validar</button><button class="btn ghost sm" data-act="reject" data-id="${c.id}">No puedo</button>`);
    }).join("") : `<p class="empty">Nada pendiente. Manda tu enlace o abre más huecos en Horario.</p>`}</div></div>
    <div class="section"><h2>Confirmadas</h2><div class="list">${confirmed.length ? confirmed.map((c) => {
      const cl = clientById(c.clientId);
      const left = Math.max(0, cl.remaining - 1);
      return citaCard(c, `
        ${cl.phone ? `<a class="btn primary sm" href="${wa(cl.phone, doneMsg(cl, left))}" target="_blank" rel="noopener" data-act="done" data-id="${c.id}">Corte hecho ${cl.remaining > 0 ? "(−1 bono)" : "(suelto)"}</a>`
          : `<button class="btn primary sm" data-act="done" data-id="${c.id}">Corte hecho ${cl.remaining > 0 ? "(−1 bono)" : "(suelto)"}</button>`}
        <button class="btn ghost sm" data-act="cancel" data-id="${c.id}">Cancelar</button>`);
    }).join("") : `<p class="empty">No hay citas confirmadas.</p>`}</div></div>
    ${lowBono.length ? `<div class="section"><h2>Ofrécele bono</h2><div class="list">${lowBono.map((c) => `
      <div class="item"><div class="item-row"><div class="grow"><div class="name">${esc(c.name)}</div><div class="muted small">${c.remaining === 0 ? "Bono agotado" : "Le queda 1 corte"}</div></div>
      <button class="btn sm ghost" data-open-client="${c.id}">Ver</button></div></div>`).join("")}</div></div>` : ""}
    ${done.length ? `<div class="section"><h2>Últimos cortes</h2><div class="list">${done.map((c) => citaCard(c, `<button class="btn ghost sm" data-act="undo-done" data-id="${c.id}">Deshacer</button>`)).join("")}</div></div>` : ""}`;
}

function paneHorario(el) {
  const db = A.db;
  const t0 = addDays(today0(), A.week * 7), today = ymd(today0());
  const slotState = {};
  db.citas.forEach((c) => { if (["pendiente", "confirmada"].includes(c.status)) slotState[c.d + c.h] = c; });
  const lbl = A.week === 0 ? "Esta semana" : A.week === 1 ? "La que viene" : `Dentro de ${A.week} semanas`;
  let days = "";
  for (let i = 0; i < 7; i++) {
    const d = ymd(addDays(t0, i)), sel = db.availability[d] || [];
    const allPast = HOURS.every((h) => isPast(d, h));
    days += `<section class="day${allPast ? " past" : ""}">
      <div class="dayhead"><div class="dname">${esc(cap(fmt(fromYmd(d), { weekday: "long", day: "numeric", month: "short" })))}${d === today ? '<span class="today">Hoy</span>' : ""}</div>
      ${allPast ? "" : `<div class="quick"><button data-q="tarde" data-d="${d}">Tarde</button><button data-q="manana" data-d="${d}">Mañana</button><button data-q="nada" data-d="${d}">Nada</button></div>`}</div>
      <div class="hours wide">${HOURS.map((h) => {
        const c = slotState[d + h], past = isPast(d, h), on = sel.includes(h);
        if (c) return `<button class="chip ${c.status === "pendiente" ? "pend" : "taken"}" disabled title="${esc(clientById(c.clientId).name)}">${esc(firstName(clientById(c.clientId).name).slice(0, 7))}</button>`;
        return `<button class="chip${on ? " on" : ""}" data-d="${d}" data-h="${h}" ${past ? "disabled" : ""} aria-pressed="${on}">${hm(h)}</button>`;
      }).join("")}</div></section>`;
  }
  el.innerHTML = `
    <div><h2>¿Cuándo puedes cortar?</h2><p class="muted" style="margin:4px 0 0">Toca las horas libres. Los colegas solo ven estas.</p></div>
    <div class="legend"><span><i style="background:var(--red)"></i>Libre</span><span><i style="background:var(--warn)"></i>Pedida</span><span><i style="background:var(--ok)"></i>Confirmada</span></div>
    <div class="weeknav"><button class="iconbtn" data-week="-1" ${A.week === 0 ? "disabled" : ""} aria-label="Semana anterior">‹</button>
      <div style="text-align:center"><b>${lbl}</b><div class="muted small">${esc(fmt(t0, { day: "numeric", month: "short" }))} – ${esc(fmt(addDays(t0, 6), { day: "numeric", month: "short" }))}</div></div>
      <button class="iconbtn" data-week="1" ${A.week >= 5 ? "disabled" : ""} aria-label="Semana siguiente">›</button></div>
    <div class="list">${days}</div>
    <div class="card"><b>Enlace para pedir cita</b><span class="muted small">Para el grupo de WhatsApp o para alguien nuevo. Les pide nombre y móvil.</span>
      <div class="copybox">${esc(origin() + "/")}</div>
      <div class="row"><a class="btn wa sm" href="${wa("", `💈 CabezApp ya está aquí. Pide tu corte (y mira mis reseñas):\n${origin()}/`)}" target="_blank" rel="noopener">${ICON.wa} Mandar por WhatsApp</a>
      <button class="btn ghost sm" data-copy="${esc(origin() + "/")}">Copiar</button></div></div>`;
}

const saveTimers = {};
function queueAvailability(d) {
  clearTimeout(saveTimers[d]);
  saveTimers[d] = setTimeout(async () => {
    try { await adminCall("availability", { d, hours: A.db.availability[d] || [] }); toast("Horario guardado"); }
    catch {}
  }, 700);
}

function paneClientes(el) {
  const db = A.db, s = db.settings;
  const list = [...db.clients].sort((a, b) => a.name.localeCompare(b.name, "es"));
  el.innerHTML = `
    <form class="card" id="newc">
      <h3>Nuevo cliente</h3>
      <div class="grid2"><div><label class="fl" for="nc-name">Nombre</label><input class="field" id="nc-name" maxlength="40" required placeholder="Pablo"></div>
      <div><label class="fl" for="nc-phone">Móvil</label><input class="field" id="nc-phone" type="tel" inputmode="tel" placeholder="600 123 456"></div></div>
      <label class="check"><input type="checkbox" id="nc-bono" checked> Ha pagado bono (${s.cutsPerBono} cortes · ${s.bonoPrice} €)</label>
      <button class="btn primary">Añadir</button>
    </form>
    <div class="section"><div class="section-head"><h2>Clientes</h2><span class="muted small">${list.length}</span></div>
    <div class="list">${list.length ? list.map((c) => clientCard(c, s)).join("") : `<p class="empty">Todavía no hay nadie. Añade al primero arriba o manda el enlace general.</p>`}</div></div>`;
}

function clientCard(c, s) {
  const dots = c.total ? Array.from({ length: Math.min(c.total, 10) }, (_, i) => `<span class="${i < c.used ? "u" : ""}"></span>`).join("") : "";
  const link = personalLink(c.token);
  return `<details class="item client" ${A.openClient === c.id ? "open" : ""} data-client="${c.id}">
    <summary class="item-row"><div class="grow"><div class="name">${esc(c.name)}</div>
      <div class="muted small">${c.total ? `<span class="mini">${dots}</span> ${c.remaining} de ${c.total}` : "Sin bono"}${c.phone ? "" : " · sin móvil"}</div></div>
      <span class="status ${c.remaining ? "st-confirmada" : "st-cancelada"}">${c.remaining} ${c.remaining === 1 ? "corte" : "cortes"}</span></summary>
    <div class="body">
      <div class="row">
        ${c.phone ? `<a class="btn ok sm" href="${wa(c.phone, bonoMsg(c, s))}" target="_blank" rel="noopener" data-cact="add-bono" data-id="${c.id}">+ Bono (${s.bonoPrice} €)</a>`
          : `<button class="btn ok sm" data-cact="add-bono" data-id="${c.id}">+ Bono (${s.bonoPrice} €)</button>`}
        <button class="btn ghost sm" data-cact="adjust" data-delta="1" data-id="${c.id}" ${c.remaining ? "" : "disabled"}>−1 corte</button>
        <button class="btn ghost sm" data-cact="adjust" data-delta="-1" data-id="${c.id}" ${c.used ? "" : "disabled"}>+1 corte</button>
      </div>
      <div><span class="eyebrow">Su enlace personal</span><div class="copybox">${esc(link)}</div></div>
      <div class="row">
        ${c.phone ? `<a class="btn wa sm" href="${wa(c.phone, linkMsg(c))}" target="_blank" rel="noopener">${ICON.wa} Mandarle su enlace</a>` : ""}
        <button class="btn ghost sm" data-copy="${esc(link)}">Copiar enlace</button>
      </div>
      ${c.bonos.length ? `<div class="muted small">Bonos: ${c.bonos.map((b) => `${new Date(b.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} (${b.price} €) <button class="linkbtn" data-cact="remove-bono" data-id="${c.id}" data-bono="${b.id}">quitar</button>`).join(" · ")}</div>` : ""}
      <div class="grid2"><div><label class="fl" for="en-${c.id}">Nombre</label><input class="field" id="en-${c.id}" value="${esc(c.name)}" maxlength="40"></div>
      <div><label class="fl" for="ep-${c.id}">Móvil</label><input class="field" id="ep-${c.id}" type="tel" value="${esc(c.phone)}"></div></div>
      <div class="row"><button class="btn ghost sm" data-cact="edit-client" data-id="${c.id}">Guardar datos</button>
      <button class="btn danger sm" data-cact="delete-client" data-id="${c.id}">Borrar cliente</button></div>
    </div></details>`;
}

function paneResenas(el) {
  const db = A.db;
  const list = [...db.reviews].sort((a, b) => b.date.localeCompare(a.date));
  const vis = list.filter((r) => !r.hidden);
  const avg = vis.length ? vis.reduce((a, r) => a + r.stars, 0) / vis.length : 0;
  el.innerHTML = `
    <div class="score"><b>${avg ? avg.toFixed(1).replace(".", ",") : "–"}</b><div>${stars(Math.round(avg))}<div class="muted small">${vis.length} visibles</div></div></div>
    <div class="list">${list.length ? list.map((r) => `<div class="review${r.hidden ? " hidden-r" : ""}">
      <div class="item-row"><b class="grow">${esc(clientById(r.clientId).name)}</b>${stars(r.stars)}</div>
      ${r.text ? `<p>${esc(r.text)}</p>` : ""}
      <div class="row"><button class="btn ghost sm" data-rv="${r.id}" data-hide="${r.hidden ? 0 : 1}">${r.hidden ? "Volver a mostrar" : "Ocultar"}</button></div>
    </div>`).join("") : `<p class="empty">Sin reseñas todavía. Cuando marques un corte como hecho, el WhatsApp les pide una.</p>`}</div>`;
}

function paneAjustes(el) {
  const s = A.db.settings;
  el.innerHTML = `
    <form class="card" id="cfg">
      <h3>Tu WhatsApp</h3>
      <input class="field" id="cf-phone" type="tel" inputmode="tel" value="${esc(s.adminPhone)}" placeholder="600 123 456">
      <p class="muted small" style="margin:0">Los colegas te avisan aquí cuando piden cita.</p>
      <h3>Precios</h3>
      <div class="grid2">
        <div><label class="fl" for="cf-cuts">Cortes por bono</label><input class="field" id="cf-cuts" type="number" min="1" max="20" value="${s.cutsPerBono}"></div>
        <div><label class="fl" for="cf-price">Precio bono (€)</label><input class="field" id="cf-price" type="number" min="0" step="0.5" value="${s.bonoPrice}"></div>
        <div><label class="fl" for="cf-loose">Corte suelto (€)</label><input class="field" id="cf-loose" type="number" min="0" step="0.5" value="${s.loosePrice}"></div>
      </div>
      <h3>Aviso del WhatsApp de confirmación</h3>
      <textarea class="field" id="cf-text" maxlength="400">${esc(s.confirmText)}</textarea>
      <button class="btn primary">Guardar ajustes</button>
    </form>
    <button class="btn ghost" id="logout">Cerrar sesión de admin en este móvil</button>`;
  $("#cfg").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await adminCall("settings", { adminPhone: $("#cf-phone").value, cutsPerBono: $("#cf-cuts").value, bonoPrice: $("#cf-price").value, loosePrice: $("#cf-loose").value, confirmText: $("#cf-text").value });
      toast("Ajustes guardados"); drawAdmin();
    } catch {}
  });
  $("#logout").onclick = () => { store.del(LS_ADMIN); adminLogin(); };
}

// One delegated handler for the whole admin panel
function wireAdmin() {
  app.addEventListener("click", async (e) => {
    if (!A.db || route() !== "admin") return;
    const t = e.target.closest("button, a");
    if (!t) return;
    const ds = t.dataset;
    if (ds.tab) { A.tab = ds.tab; drawAdmin(); window.scrollTo(0, 0); return; }
    if (ds.copy) { copy(ds.copy, "Enlace copiado"); return; }
    if (ds.openClient) { A.tab = "clientes"; A.openClient = ds.openClient; drawAdmin(); return; }
    if (ds.week) { A.week = Math.max(0, A.week + +ds.week); drawAdmin(); return; }
    if (ds.d && ds.h) {
      const cur = new Set(A.db.availability[ds.d] || []);
      cur.has(ds.h) ? cur.delete(ds.h) : cur.add(ds.h);
      A.db.availability[ds.d] = [...cur].sort();
      drawAdmin(); queueAvailability(ds.d); return;
    }
    if (ds.q && ds.d) {
      const set = { tarde: ["1700", "1800", "1900", "2000"], manana: ["1000", "1100", "1200", "1300"], nada: [] }[ds.q];
      A.db.availability[ds.d] = set.filter((h) => !isPast(ds.d, h));
      drawAdmin(); queueAvailability(ds.d); return;
    }
    if (ds.act) {
      // WhatsApp links open by themselves; the state change runs alongside
      if (ds.act === "cancel" && ds.sure !== "1") { ds.sure = "1"; t.textContent = "¿Seguro? Toca otra vez"; return; }
      try { await adminCall(ds.act, { id: ds.id }); toast({ confirm: "Validada", reject: "Rechazada", done: "Corte apuntado", cancel: "Cancelada", "undo-done": "Deshecho" }[ds.act] || "Hecho"); drawAdmin(); } catch {}
      return;
    }
    if (ds.cact) {
      A.openClient = ds.id;
      let body = { id: ds.id };
      if (ds.cact === "adjust") body.delta = +ds.delta;
      if (ds.cact === "remove-bono") body.bonoId = ds.bono;
      if (ds.cact === "edit-client") body = { id: ds.id, name: $("#en-" + ds.id).value, phone: $("#ep-" + ds.id).value };
      if (ds.cact === "delete-client" && ds.sure !== "1") { ds.sure = "1"; t.textContent = "Se borra todo. ¿Seguro?"; return; }
      try {
        await adminCall(ds.cact, body);
        if (ds.cact === "delete-client") A.openClient = null;
        toast({ "add-bono": "Bono añadido", adjust: "Bono ajustado", "edit-client": "Guardado", "delete-client": "Cliente borrado", "remove-bono": "Bono quitado" }[ds.cact]);
        drawAdmin();
      } catch {}
      return;
    }
    if (ds.rv) { try { await adminCall("review-visibility", { id: ds.rv, hidden: ds.hide === "1" }); drawAdmin(); } catch {} }
  });
  app.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.matches && d.matches("details.client")) A.openClient = d.open ? d.dataset.client : (A.openClient === d.dataset.client ? null : A.openClient);
  }, true);
  app.addEventListener("submit", async (e) => {
    if (e.target.id !== "newc") return;
    e.preventDefault();
    try {
      const r = await adminCall("add-client", { name: $("#nc-name").value, phone: $("#nc-phone").value, withBono: $("#nc-bono").checked });
      A.openClient = r.result.client.id;
      toast("Cliente añadido. Mándale su enlace.");
      drawAdmin();
    } catch {}
  });
}

// ---------- router ----------
function route() {
  const p = location.pathname;
  if (p.startsWith("/c/")) return "client";
  if (p.startsWith("/admin")) return "admin";
  return "landing";
}
(async function start() {
  try {
    const r = route();
    if (r === "client") await personal(decodeURIComponent(location.pathname.slice(3).split("/")[0]));
    else if (r === "admin") { wireAdmin(); await admin(); }
    else await landing();
  } catch (e) {
    app.innerHTML = `<div><h1>Uy.</h1><p class="lead">${esc(e.message || "No se ha podido cargar")}. Recarga en un momento.</p></div>`;
  }
})();
