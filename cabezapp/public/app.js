// CabezApp front-end: three screens on one page.
//   /            -> cualquiera pide corte para una semana (nombre + móvil)
//   /c/<token>   -> zona personal: pide corte, pilla hueco, bono, reseña
//   /admin       -> panel de Cabezas
"use strict";

const HOURS = ["1000", "1100", "1200", "1300", "1600", "1700", "1800", "1900", "2000", "2100"];
const STYLES = ["Degradado", "Lo de siempre", "Rapado", "Solo puntas", "Arreglo de barba", "Sorpréndeme"];
const PREFS = [["igual", "Me da igual"], ["tardes", "Por la tarde"], ["mananas", "Por la mañana"], ["finde", "Finde"]];
const prefLabel = (p) => (PREFS.find((x) => x[0] === p) || PREFS[0])[1];
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
const dayName = (s) => cap(fmt(fromYmd(s), { weekday: "long", day: "numeric" }));
const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isPast = (d, h) => { const x = fromYmd(d); x.setHours(+h.slice(0, 2), +h.slice(2)); return x <= new Date(); };
const slotTxt = (s) => `${shortDay(s.slice(0, 8))} · ${hm(s.slice(8))}`;
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const callName = (c) => (c && c.nick) || firstName(c && c.name);
const fullName = (c) => c.name + (c.nick ? ` «${c.nick}»` : "");
const weekRange = (w) => `${fmt(fromYmd(w), { day: "numeric" })}–${fmt(addDays(fromYmd(w), 6), { day: "numeric", month: "short" })}`;
const weekLabel = (w, weeks) => (w === weeks.current ? "esta semana" : w === weeks.next ? "la semana que viene" : "la semana del " + weekRange(w));
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
  if (!r.ok) { const e = new Error(data.error || "Algo ha petado. Prueba otra vez."); e.status = r.status; throw e; }
  return data;
}

// ---------- installable app ----------
let deferredPrompt = null;
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e;
  document.querySelectorAll("[data-install-btn]").forEach((b) => (b.hidden = false));
  document.querySelectorAll(".install-how").forEach((x) => (x.hidden = true));
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-install-btn]");
  if (!b || !deferredPrompt) return;
  deferredPrompt.prompt();
  const r = await deferredPrompt.userChoice.catch(() => null);
  if (r && r.outcome === "accepted") { toast("Instalada. Búscala en tu móvil"); b.closest(".install")?.remove(); }
  deferredPrompt = null;
});
function installCard(what) {
  if (standalone()) return "";
  const how = isIOS
    ? "En el iPhone: toca el botón Compartir (el cuadrado con la flecha) y luego «Añadir a pantalla de inicio»."
    : deferredPrompt ? "" : "En Android: menú ⋮ de Chrome y «Instalar aplicación» o «Añadir a pantalla de inicio».";
  return `<div class="card install"><img src="/icon-192.png" alt=""><div class="grow"><b>Instálala como app</b><p>${esc(what)} <span class="install-how">${how}</span></p></div>
    ${isIOS ? "" : `<button class="btn primary sm" data-install-btn ${deferredPrompt ? "" : "hidden"}>Instalar</button>`}</div>`;
}
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

// =====================================================================
// Request form: one tap (which week); the rest is optional
// =====================================================================
function requestForm(el, { needContact, weeks, onDone }) {
  const s = { week: weeks.current, pref: "igual", style: STYLES[0], note: "", name: "", nick: "", phone: "", busy: false, error: "", more: false };
  const ready = () => !needContact || (s.name.trim().length > 1 && s.phone.replace(/\D/g, "").length >= 9);
  function draw() {
    el.innerHTML = `
      <div class="weekpick">${[["current", "Esta semana"], ["next", "La que viene"]].map(([k, l]) => `
        <button class="wbtn${s.week === weeks[k] ? " on" : ""}" data-week="${weeks[k]}" aria-pressed="${s.week === weeks[k]}"><b>${l}</b><span>${esc(weekRange(weeks[k]))}</span></button>`).join("")}
      </div>
      ${needContact ? `<div class="grid2">
          <div><label class="fl" for="rq-name">Tu nombre</label><input class="field" id="rq-name" autocomplete="given-name" maxlength="40" value="${esc(s.name)}" placeholder="Nombre y apellido"></div>
          <div><label class="fl" for="rq-nick">Tu mote <span class="muted">(opcional)</span></label><input class="field" id="rq-nick" maxlength="30" value="${esc(s.nick)}" placeholder="Como te llaman"></div>
          <div><label class="fl" for="rq-phone">Tu móvil</label><input class="field" id="rq-phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(s.phone)}" placeholder="600 123 456"></div>
        </div>` : ""}
      <details class="more" ${s.more ? "open" : ""}><summary>Más detalles (opcional)</summary>
        <div class="more-body">
          <div class="step"><span class="eyebrow">¿Cuándo te viene mejor?</span>
            <div class="pills">${PREFS.map(([k, l]) => `<button class="pill${s.pref === k ? " on" : ""}" data-pref="${k}" aria-pressed="${s.pref === k}">${l}</button>`).join("")}</div></div>
          <div class="step"><span class="eyebrow">¿Qué corte?</span>
            <div class="pills">${STYLES.map((x) => `<button class="pill${s.style === x ? " on" : ""}" data-style="${esc(x)}" aria-pressed="${s.style === x}">${esc(x)}</button>`).join("")}</div></div>
          <input class="field" id="rq-note" maxlength="200" placeholder="Algo más para Cabezas" value="${esc(s.note)}">
        </div></details>
      ${s.error ? `<p class="err">${esc(s.error)}</p>` : ""}
      <button class="btn primary big" id="rq-send" ${ready() && !s.busy ? "" : "disabled"}>${s.busy ? "Enviando…" : `Pedir corte para ${esc(weekLabel(s.week, weeks))}`}</button>`;
  }
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || !el.contains(b)) return;
    if (b.dataset.week) s.week = b.dataset.week;
    else if (b.dataset.pref) s.pref = b.dataset.pref;
    else if (b.dataset.style) s.style = b.dataset.style;
    else if (b.id === "rq-send") {
      s.busy = true; s.error = ""; draw();
      try { await onDone({ week: s.week, pref: s.pref, style: s.style, note: s.note, name: s.name, nick: s.nick, phone: s.phone }); return; }
      catch (err) { s.error = err.message; s.busy = false; }
    } else return;
    draw();
  });
  el.addEventListener("toggle", (e) => { if (e.target.matches("details.more")) s.more = e.target.open; }, true);
  el.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "rq-note") s.note = t.value;
    if (t.id === "rq-name") s.name = t.value;
    if (t.id === "rq-nick") s.nick = t.value;
    if (t.id === "rq-phone") s.phone = t.value;
    if (t.id === "rq-name" || t.id === "rq-phone") $("#rq-send", el).disabled = !ready();
  });
  draw();
}

const requestMsg = (b, who, weeks) =>
  `Ey Cabezas 💈 Quiero cortarme ${weekLabel(b.week, weeks)}` + (b.pref && b.pref !== "igual" ? ` (${prefLabel(b.pref).toLowerCase()})` : "") +
  `.\n✂️ ${b.style}` + (b.note ? `\n📝 ${b.note}` : "") + `\nSoy ${who}. Pásame horas 🙏`;

function reviewsBlock(reviews) {
  if (!reviews.count) return `<div class="section"><h2>Reseñas</h2><p class="empty">Todavía nadie ha opinado. Estrénalas tú después de tu corte.</p></div>`;
  return `<div class="section">
    <h2>Lo que dicen los colegas</h2>
    <div class="score"><b>${reviews.avg.toFixed(1).replace(".", ",")}</b><div>${stars(Math.round(reviews.avg))}<div class="muted small">${reviews.count} ${reviews.count === 1 ? "reseña" : "reseñas"}</div></div></div>
    <div class="list">${reviews.list.map((r) => `<div class="review">
      <div class="item-row"><b class="grow">${esc(r.name)}</b>${stars(r.stars)}</div>
      ${r.text ? `<p>${esc(r.text)}</p>` : ""}</div>`).join("")}</div></div>`;
}

// =====================================================================
// /  — anyone asks for a cut
// =====================================================================
async function landing() {
  $("#roleTag").textContent = "";
  const saved = store.get(LS_TOKEN);
  if (saved && !new URLSearchParams(location.search).has("nuevo")) { location.replace("/c/" + encodeURIComponent(saved)); return; }
  const data = await api("public");
  const s = data.settings;
  app.innerHTML = `
    <div class="hero"><div class="grow">
      <h1>Pilla tu <em>corte</em>.</h1>
      <p class="lead">Dinos qué semana te viene bien. Cabezas te pasa las horas libres por WhatsApp y eliges una.</p></div>
      <div class="hero-logo" aria-hidden="true"><img src="/logo.svg" alt=""></div></div>
    <form class="state" id="login"><h2>¿Ya eres cliente? Entra</h2>
      <div class="grid2">
        <div><label class="fl" for="lg-phone">Tu móvil</label><input class="field" id="lg-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="600 123 456" required></div>
        <div><label class="fl" for="lg-pin">Tu PIN</label><input class="field pin-in" id="lg-pin" inputmode="numeric" autocomplete="current-password" maxlength="4" placeholder="····" required></div>
      </div>
      <p class="err" id="lg-err" hidden></p>
      <button class="btn primary big" id="lg-go">Entrar</button>
      <p class="muted small">El PIN te lo da Cabezas. ¿No lo tienes? Pídeselo.</p></form>
    <div class="state"><h2>¿Primera vez? Pide tu corte</h2><div id="rq"></div></div>
    <div class="bono">
      <div class="top"><div><div class="eyebrow" style="color:#C9D2EA">Bono</div>
        <div class="big">${s.cutsPerBono}<small>cortes</small></div>
        <div class="sub">${s.bonoPrice} € · sale a ${(s.bonoPrice / s.cutsPerBono).toFixed(0)} € el corte. Suelto: ${s.loosePrice} €</div></div>
        <span class="sticker">Pídeselo a Cabezas</span></div>
    </div>
    ${installCard("Así pides corte en dos toques.")}
    ${reviewsBlock(data.reviews)}
    <footer class="foot">CabezApp · degradados de calle desde el salón de casa.<br>No nos hacemos responsables de dibujos en la nuca.</footer>`;
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#lg-err"), btn = $("#lg-go");
    err.hidden = true; btn.disabled = true; btn.textContent = "Entrando…";
    try {
      const r = await api("login", { method: "POST", body: { phone: $("#lg-phone").value, pin: $("#lg-pin").value } });
      store.set(LS_TOKEN, r.token);
      location.href = "/c/" + encodeURIComponent(r.token);
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; btn.textContent = "Entrar"; }
  });
  requestForm($("#rq"), {
    needContact: true, weeks: data.weeks,
    onDone: async (b) => {
      const r = await api("request", { method: "POST", body: b });
      store.set(LS_TOKEN, r.token);
      location.href = "/c/" + encodeURIComponent(r.token);
    },
  });
}

// =====================================================================
// /c/<token> — personal zone
// =====================================================================
const STATUS_TXT = { pedida: "Pedido", huecos: "Elige hueco", confirmada: "Confirmada", hecha: "Hecho", rechazada: "No pudo ser", cancelada: "Cancelada" };

// Cut card: any number of cuts (bonos of 5, cuts paid before, gifts...)
function punchCard(me) {
  if (!me.total) {
    return `<div class="bono empty"><div class="top"><div>
      <div class="eyebrow">Tus cortes</div><div class="big">0<small>cortes</small></div>
      <div class="sub muted">No tienes cortes cargados. Pídele a Cabezas que te cargue unos.</div></div></div></div>`;
  }
  const show = Math.min(me.total, 10);
  const leftShown = Math.min(me.remaining, show);
  const extra = me.remaining - leftShown;
  const holes = Array.from({ length: show }, (_, i) => i < show - leftShown
    ? `<span class="hole used" title="Corte gastado">${ICON.scissors}</span>`
    : `<span class="hole">${i + 1}</span>`).join("");
  return `<div class="bono">
    <div class="top"><div>
      <div class="eyebrow" style="color:#C9D2EA">Te quedan</div>
      <div class="big">${me.remaining}<small>${me.remaining === 1 ? "corte" : "cortes"}</small></div>
      <div class="sub">Llevas ${me.used} de ${me.total}</div></div>
      ${me.remaining === 0 ? `<span class="sticker">Toca recargar</span>` : me.remaining === 1 ? `<span class="sticker">Último corte</span>` : extra ? `<span class="sticker">+${extra} más</span>` : ""}
    </div>
    <div class="holes" aria-label="${me.remaining} cortes por gastar">${holes}</div>
  </div>`;
}

let personalWired = false, myStars = 0, pickSel = null, currentToken = null;

function progress(step) {
  const steps = ["Pedido", "Eliges hora", "Confirmada"];
  return `<ol class="progress" aria-label="Paso ${step} de 3">${steps.map((l, i) => `<li class="${i + 1 < step ? "done" : i + 1 === step ? "on" : ""}"><span>${i + 1 < step ? "✓" : i + 1}</span>${l}</li>`).join("")}</ol>`;
}

// The one card that says where your appointment is
function statusBlock(c, me, settings, weeks) {
  if (!c) {
    return `<section class="state"><span class="eyebrow">Tu cita</span><h2>No tienes cita. ¿Toca corte?</h2><div id="rq"></div></section>`;
  }
  const wl = weekLabel(c.week, weeks);
  const toCabezas = (text, label) => settings.adminPhone ? `<a class="btn wa" href="${wa(settings.adminPhone, text)}" target="_blank" rel="noopener">${ICON.wa} ${label}</a>` : "";
  if (c.status === "pedida") {
    return `<section class="state"><span class="eyebrow">Tu cita</span>${progress(1)}
      <h2>Pedido enviado para ${esc(wl)}</h2>
      <p>Ahora Cabezas te pasa las horas libres por WhatsApp. Cuando te lleguen, entra aquí y elige una.</p>
      ${toCabezas(requestMsg(c, fullName(me), weeks), "Avisar a Cabezas")}
      <button class="linkbtn" data-cancel="${c.id}">Cancelar pedido</button></section>`;
  }
  if (c.status === "huecos") {
    if (!c.offer.length) {
      return `<section class="state"><span class="eyebrow">Tu cita</span>${progress(2)}<h2>Se han pillado todas las horas</h2>
        <p>Pídele a Cabezas que te pase más.</p>
        ${toCabezas(`Ey Cabezas, se han pillado todas las horas que me pasaste 😅 ¿Me pasas más para ${wl}?`, "Pedir más horas")}</section>`;
    }
    const byDay = {};
    c.offer.forEach((s) => (byDay[s.slice(0, 8)] = byDay[s.slice(0, 8)] || []).push(s));
    return `<section class="state hot"><span class="eyebrow">Tu cita</span>${progress(2)}
      <h2>Elige tu hora</h2>
      ${Object.keys(byDay).sort().map((d) => `<div class="slotday"><h3>${esc(dayName(d))}</h3>
        <div class="hours">${byDay[d].map((s) => `<button class="chip${pickSel === s ? " on" : ""}" data-pick="${s}" aria-pressed="${pickSel === s}">${hm(s.slice(8))}</button>`).join("")}</div></div>`).join("")}
      <button class="btn primary big" id="pick-go" data-id="${c.id}" ${pickSel ? "" : "disabled"}>${pickSel ? `Quiero el ${esc(dayName(pickSel.slice(0, 8)).toLowerCase())} a las ${hm(pickSel.slice(8))}` : "Toca una hora"}</button>
      <p class="muted small">El primero que la elige se la queda.</p></section>`;
  }
  return `<section class="state ok"><span class="eyebrow">Tu cita</span>${progress(3)}
    <div class="appt"><div class="bigt">${hm(c.h)}</div><div class="when">${esc(longDay(c.d))}</div>
    <div class="muted">${esc(c.style)}</div></div>
    ${settings.confirmText ? `<p class="disclaimer">${esc(settings.confirmText)}</p>` : ""}
    ${toCabezas(`Pillado ✂️ ${longDay(c.d)} a las ${hm(c.h)}. Nos vemos, crack.`, "Avisar a Cabezas")}
    <button class="linkbtn" data-cancel="${c.id}">Cancelar cita</button></section>`;
}

async function personal(token) {
  $("#roleTag").textContent = "Tu zona";
  currentToken = token;
  let data;
  try { data = await api("me?t=" + encodeURIComponent(token)); }
  catch (e) {
    if (e.status === 404) store.del(LS_TOKEN);
    app.innerHTML = `<div><h1>Enlace <em>roto</em>.</h1><p class="lead">${esc(e.message)}</p></div><a class="btn primary" href="/?nuevo">Pedir corte igualmente</a>`;
    return;
  }
  store.set(LS_TOKEN, token);
  const { me, settings, reviews, weeks } = data;
  const open = me.citas.find((c) => c.open);
  const history = me.citas.filter((c) => c.status === "hecha");
  const r = me.myReview;
  myStars = r ? r.stars : 0;
  if (open && open.status === "huecos" && pickSel && !open.offer.includes(pickSel)) pickSel = null;

  app.innerHTML = `
    <h1>¿Qué pasa, <em>${esc(callName(me))}</em>?</h1>
    ${statusBlock(open, me, settings, weeks)}
    ${installCard("Tu cita y tus cortes, siempre a mano.")}
    ${punchCard(me)}
    <div class="section">
      <h2>${r ? "Tu reseña" : "Ponle nota a Cabezas"}</h2>
      <div class="card">
        <div class="starpick" id="starpick">${[1, 2, 3, 4, 5].map((n) => `<button data-star="${n}" aria-label="${n} estrellas" class="${n <= myStars ? "on" : ""}">${ICON.star}</button>`).join("")}</div>
        <textarea class="field" id="rv-text" maxlength="280" placeholder="Sé sincero. Bueno, tampoco tanto.">${esc(r ? r.text : "")}</textarea>
        <button class="btn primary" id="rv-send">${r ? "Actualizar reseña" : "Publicar reseña"}</button>
      </div>
    </div>
    ${reviewsBlock(reviews)}
    ${history.length ? `<div class="section"><h2>Tus cortes</h2><div class="list">${history.map((c) => `
      <div class="item"><div class="item-row"><div class="grow"><b>${esc(shortDay(c.d))}</b> · ${esc(c.style)}</div>
      <span class="muted small">${c.loose ? "Suelto" : "Del bono"}</span></div></div>`).join("")}</div></div>` : ""}
    ${me.pin ? `<div class="card"><b>Tus datos para entrar en la app</b>
      <div class="creds"><div><span class="eyebrow">Móvil</span><b>${esc(me.phone)}</b></div><div><span class="eyebrow">PIN</span><b class="pin">${esc(me.pin)}</b></div></div>
      <p class="muted small" style="margin:0">Si cambias de móvil o borras la app, entras con tu móvil y este PIN.</p></div>` : ""}
    <footer class="foot"><button class="linkbtn" data-notme="1">Cerrar sesión</button></footer>`;

  if (!open) {
    requestForm($("#rq"), {
      needContact: false, weeks,
      onDone: async (b) => {
        await api("request", { method: "POST", body: { ...b, t: token } });
        toast("Pedido enviado");
        personal(token); window.scrollTo(0, 0);
      },
    });
  }

  if (personalWired) return;
  personalWired = true;
  app.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || route() !== "client") return;
    const t = currentToken;
    if (b.dataset.notme) { store.del(LS_TOKEN); location.href = "/?nuevo"; }
    else if (b.dataset.star) {
      myStars = +b.dataset.star;
      $("#starpick").querySelectorAll("button").forEach((x) => x.classList.toggle("on", +x.dataset.star <= myStars));
    } else if (b.dataset.pick) {
      pickSel = b.dataset.pick; personal(t);
    } else if (b.id === "pick-go") {
      b.disabled = true; b.textContent = "Reservando…";
      try { await api("pick", { method: "POST", body: { t, id: b.dataset.id, slot: pickSel } }); pickSel = null; toast("¡Cita confirmada!"); }
      catch (err) { toast(err.message, true); pickSel = null; }
      personal(t); window.scrollTo(0, 0);
    } else if (b.id === "rv-send") {
      if (!myStars) return toast("Elige las estrellas", true);
      b.disabled = true;
      try { await api("review", { method: "POST", body: { t, stars: myStars, text: $("#rv-text").value } }); toast("Reseña publicada"); personal(t); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    } else if (b.dataset.cancel) {
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Toca otra vez para cancelar"; return; }
      try { await api("cancel", { method: "POST", body: { t, id: b.dataset.cancel } }); toast("Cancelado"); personal(t); }
      catch (err) { toast(err.message, true); }
    }
  });
}

// =====================================================================
// /admin — Cabezas' panel
// =====================================================================
const A = { db: null, tab: "peticiones", week: 0, openClient: null, sel: {} };

const offerMsg = (c, cl, slots) =>
  `Ey ${callName(cl)} 💈 Huecos para cortarte ${weekLabel(c.week, A.db.weeks)}:\n${slots.map((s) => "• " + slotTxt(s)).join("\n")}\n\nPilla el tuyo aquí antes de que vuele 👇\n${personalLink(cl.token)}`;
const rejectMsg = (c, cl) => `Ey ${callName(cl)}, ${weekLabel(c.week, A.db.weeks)} imposible 😩 Pídemelo para otra semana aquí:\n${personalLink(cl.token)}`;
// Confirmation WhatsApp: no prices, just "tienes corte" and a bit of cachondeo
const JOKES = [
  "Ven con la cabeza lavada, que esto es una barbería seria (más o menos).",
  "Puntualidad, crack. La maquinilla no espera a nadie.",
  "Si llegas tarde, el degradado lo hago con los ojos cerrados.",
  "Tú trae la cabeza, que el arte lo pongo yo.",
  "Si te rajas, la próxima vez te rapo al cero sin preguntar.",
];
function confirmMsg(c, cl, s) {
  const joke = JOKES[[...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % JOKES.length];
  return `💈 ¡${callName(cl)}, tienes corte, máquina!\n\n📅 ${longDay(c.d)} a las ${hm(c.h)}\n✂️ ${c.style}\n\n${joke}\n\n⚠️ ${s.confirmText}\n\nTu cita, aquí:\n${personalLink(cl.token)}`;
}
const linkMsg = (cl) => `Ey ${callName(cl)}! 💈 Ya estás en CabezApp: pides corte, ves cuántos te quedan y me dejas reseña.\n\nTu zona (instálala como app):\n${personalLink(cl.token)}\n\nPara entrar desde la app: tu móvil y el PIN ${cl.pin} 🔐`;
const doneMsg = (cl, left) => `Corte hecho ✂️ ${left > 0 ? `Te ${left === 1 ? "queda" : "quedan"} ${left} ${left === 1 ? "corte" : "cortes"} del bono.` : "Bono fundido, toca renovar 🫡"}\nSi te ha gustado (o no), déjame reseña:\n${personalLink(cl.token)}`;
const bonoMsg = (cl, s) => `Bono cargado 🎟️ Tienes ${cl.remaining + s.cutsPerBono} cortes por delante. A lucir cabeza. Míralo aquí:\n${personalLink(cl.token)}`;

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
  app.innerHTML = `<div class="hero"><div class="grow"><h1>Panel de <em>Cabezas</em></h1><p class="lead">Mete tu clave. Solo una vez en este móvil.</p></div>
    <div class="hero-logo" aria-hidden="true"><img src="/logo.svg" alt=""></div></div>
    <form class="card" id="login"><label class="fl" for="ak">Clave</label>
    <input class="field" id="ak" type="password" autocomplete="current-password" required>
    ${err ? `<p class="err">${esc(err)}</p>` : ""}<button class="btn primary">Entrar</button></form>`;
  $("#login").addEventListener("submit", (e) => { e.preventDefault(); store.set(LS_ADMIN, $("#ak").value.trim()); admin(); });
}

const clientById = (id) => A.db.clients.find((c) => c.id === id) || { name: "Borrado", remaining: 0, token: "", phone: "" };
const takenSet = () => new Set(A.db.citas.filter((c) => (c.status === "confirmada" || c.status === "hecha") && c.d).map((c) => c.d + c.h));
function freeSlots(week) {
  const taken = takenSet(), out = [];
  for (let i = 0; i < 7; i++) {
    const d = ymd(addDays(fromYmd(week), i));
    (A.db.availability[d] || []).forEach((h) => { if (!isPast(d, h) && !taken.has(d + h)) out.push(d + h); });
  }
  return out.sort();
}
function prefMatch(slot, pref) {
  const h = +slot.slice(8, 10), dow = fromYmd(slot.slice(0, 8)).getDay();
  if (pref === "tardes") return h >= 15;
  if (pref === "mananas") return h < 15;
  if (pref === "finde") return dow === 0 || dow === 6;
  return true;
}

function drawAdmin() {
  const db = A.db;
  const asks = db.citas.filter((c) => c.status === "pedida").length;
  const tabs = [["peticiones", "Peticiones", asks], ["horario", "Huecos"], ["clientes", "Clientes"], ["resenas", "Reseñas"], ["ajustes", "Ajustes"]];
  app.innerHTML = `
    <nav class="tabs" aria-label="Secciones">${tabs.map(([k, l, n]) => `<button class="tab${A.tab === k ? " on" : ""}" data-tab="${k}">${l}${n ? `<span class="badge">${n}</span>` : ""}</button>`).join("")}</nav>
    <div id="pane" class="section"></div>`;
  ({ peticiones: panePeticiones, horario: paneHorario, clientes: paneClientes, resenas: paneResenas, ajustes: paneAjustes })[A.tab]($("#pane"));
}

function head(c) {
  const cl = clientById(c.clientId);
  const when = c.d ? `<div class="time">${hm(c.h)}</div>` : "";
  const sub = c.d ? `${esc(shortDay(c.d))} · ${esc(c.style)}` : `${esc(cap(weekLabel(c.week, A.db.weeks)))} · ${esc(prefLabel(c.pref).toLowerCase())} · ${esc(c.style)}`;
  return `<div class="item-row">${when}
    <div class="grow"><div class="name">${esc(fullName(cl))}</div><div class="muted small">${sub} · ${cl.remaining > 0 ? `le quedan ${cl.remaining}` : "sin cortes"}</div></div>
    <span class="status st-${c.status}">${STATUS_TXT[c.status]}</span></div>
    ${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}`;
}

function offerCard(c) {
  const cl = clientById(c.clientId);
  const free = freeSlots(c.week);
  if (!A.sel[c.id]) {
    const base = c.status === "huecos" ? (c.offer || []).filter((s) => free.includes(s)) : free.filter((s) => prefMatch(s, c.pref));
    A.sel[c.id] = new Set(base.length ? base : free);
  }
  const sel = [...A.sel[c.id]].filter((s) => free.includes(s)).sort();
  const byDay = {};
  free.forEach((s) => (byDay[s.slice(0, 8)] = byDay[s.slice(0, 8)] || []).push(s));
  const offerBtn = sel.length
    ? (cl.phone
      ? `<a class="btn wa sm" href="${wa(cl.phone, offerMsg(c, cl, sel))}" target="_blank" rel="noopener" data-act="offer" data-id="${c.id}">${ICON.wa} ${c.status === "huecos" ? "Reenviar" : "Mandar"} ${sel.length} ${sel.length === 1 ? "hueco" : "huecos"}</a>`
      : `<button class="btn wa sm" data-act="offer" data-id="${c.id}">Guardar ${sel.length} huecos (no tiene móvil)</button>`)
    : `<button class="btn wa sm" disabled>Elige huecos</button>`;
  return `<div class="item">${head(c)}
    ${free.length ? `<div class="offerbox"><span class="eyebrow">Tus huecos libres esa semana · toca para quitar o poner</span>
      ${Object.keys(byDay).sort().map((d) => `<div class="slotday"><h3>${esc(dayName(d))}</h3><div class="hours wide">${byDay[d].map((s) => `<button class="chip${sel.includes(s) ? " sel" : ""}" data-slot="${s}" data-cid="${c.id}" aria-pressed="${sel.includes(s)}">${hm(s.slice(8))}</button>`).join("")}</div></div>`).join("")}</div>`
      : `<p class="muted small" style="margin:0">No tienes huecos libres ${esc(weekLabel(c.week, A.db.weeks))}. Ábrelos en Huecos.</p><button class="btn ghost sm" data-tab="horario">Abrir huecos</button>`}
    <div class="row">${offerBtn}
      ${sel.length === 1 ? `<button class="btn ok sm" data-act="assign" data-id="${c.id}" data-slot="${sel[0]}">Dárselo directo</button>` : ""}
      ${cl.phone ? `<a class="btn ghost sm" href="${wa(cl.phone, rejectMsg(c, cl))}" target="_blank" rel="noopener" data-act="reject" data-id="${c.id}">Esa semana no</a>`
        : `<button class="btn ghost sm" data-act="reject" data-id="${c.id}">Esa semana no</button>`}</div>
  </div>`;
}

function panePeticiones(el) {
  const db = A.db, s = db.settings;
  const sort = (a, b) => (a.d + a.h).localeCompare(b.d + b.h);
  const asks = db.citas.filter((c) => c.status === "pedida").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const waiting = db.citas.filter((c) => c.status === "huecos").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const confirmed = db.citas.filter((c) => c.status === "confirmada").sort(sort);
  const done = db.citas.filter((c) => c.status === "hecha").sort(sort).reverse().slice(0, 8);
  const lowBono = db.clients.filter((c) => c.total > 0 && c.remaining <= 1);
  const money = db.clients.reduce((a, c) => a + c.bonos.reduce((x, b) => x + b.price, 0), 0);

  el.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${asks.length}</b><span>Piden corte</span></div>
      <div class="stat"><b>${confirmed.length}</b><span>Confirmados</span></div>
      <div class="stat"><b>${money}€</b><span>En bonos</span></div>
    </div>
    ${!s.adminPhone ? `<div class="card"><b>Pon tu WhatsApp en Ajustes</b><span class="muted small">Así los colegas te avisan cuando piden corte.</span><button class="btn sm ghost" data-tab="ajustes">Ir a Ajustes</button></div>` : ""}
    <div class="section"><h2>Te piden corte</h2><div class="list">${asks.length ? asks.map(offerCard).join("")
      : `<p class="empty">Nadie pide corte ahora mismo. Pasa el enlace por el grupo (pestaña Huecos).</p>`}</div></div>
    ${waiting.length ? `<div class="section"><h2>Esperando que pillen hueco</h2><div class="list">${waiting.map(offerCard).join("")}</div></div>` : ""}
    <div class="section"><h2>Confirmados</h2><div class="list">${confirmed.length ? confirmed.map((c) => {
      const cl = clientById(c.clientId);
      const left = Math.max(0, cl.remaining - 1);
      const doneLbl = `Corte hecho ${cl.remaining > 0 ? "(−1 bono)" : "(suelto)"}`;
      return `<div class="item">${head(c)}<div class="row">
        ${cl.phone ? `<a class="btn ${c.confirmSent ? "ghost" : "ok"} sm" href="${wa(cl.phone, confirmMsg(c, cl, s))}" target="_blank" rel="noopener" data-act="sent" data-id="${c.id}">${ICON.wa} ${c.confirmSent ? "Confirmación enviada" : "Mandar confirmación"}</a>` : ""}
        ${cl.phone ? `<a class="btn primary sm" href="${wa(cl.phone, doneMsg(cl, left))}" target="_blank" rel="noopener" data-act="done" data-id="${c.id}">${doneLbl}</a>`
          : `<button class="btn primary sm" data-act="done" data-id="${c.id}">${doneLbl}</button>`}
        <button class="btn ghost sm" data-act="cancel" data-id="${c.id}">Cancelar</button></div></div>`;
    }).join("") : `<p class="empty">Ningún corte confirmado.</p>`}</div></div>
    ${lowBono.length ? `<div class="section"><h2>Ofrécele bono</h2><div class="list">${lowBono.map((c) => `
      <div class="item"><div class="item-row"><div class="grow"><div class="name">${esc(c.name)}</div><div class="muted small">${c.remaining === 0 ? "Bono fundido" : "Le queda 1 corte"}</div></div>
      <button class="btn sm ghost" data-open-client="${c.id}">Ver</button></div></div>`).join("")}</div></div>` : ""}
    ${done.length ? `<div class="section"><h2>Últimos cortes</h2><div class="list">${done.map((c) => `<div class="item">${head(c)}<div class="row"><button class="btn ghost sm" data-act="undo-done" data-id="${c.id}">Deshacer</button></div></div>`).join("")}</div></div>` : ""}`;
}

function paneHorario(el) {
  const db = A.db;
  const t0 = addDays(fromYmd(db.weeks.current), A.week * 7), today = ymd(today0());
  const booked = {};
  db.citas.forEach((c) => { if ((c.status === "confirmada" || c.status === "hecha") && c.d) booked[c.d + c.h] = c; });
  const lbl = A.week === 0 ? "Esta semana" : A.week === 1 ? "La que viene" : `Dentro de ${A.week} semanas`;
  let days = "";
  for (let i = 0; i < 7; i++) {
    const d = ymd(addDays(t0, i)), sel = db.availability[d] || [];
    const allPast = HOURS.every((h) => isPast(d, h));
    days += `<section class="day${allPast ? " past" : ""}">
      <div class="dayhead"><div class="dname">${esc(cap(fmt(fromYmd(d), { weekday: "long", day: "numeric", month: "short" })))}${d === today ? '<span class="today">Hoy</span>' : ""}</div>
      ${allPast ? "" : `<div class="quick"><button data-q="tarde" data-d="${d}">Tarde</button><button data-q="manana" data-d="${d}">Mañana</button><button data-q="nada" data-d="${d}">Nada</button></div>`}</div>
      <div class="hours wide">${HOURS.map((h) => {
        const c = booked[d + h], past = isPast(d, h), on = sel.includes(h);
        if (c) return `<button class="chip taken" disabled title="${esc(clientById(c.clientId).name)}">${esc(callName(clientById(c.clientId)).slice(0, 7))}</button>`;
        return `<button class="chip${on ? " on" : ""}" data-d="${d}" data-h="${h}" ${past ? "disabled" : ""} aria-pressed="${on}">${hm(h)}</button>`;
      }).join("")}</div></section>`;
  }
  el.innerHTML = `
    <div><h2>¿Cuándo puedes cortar?</h2><p class="muted" style="margin:4px 0 0">Marca tus huecos libres. Nadie los ve hasta que se los mandas desde Peticiones.</p></div>
    <div class="legend"><span><i style="background:var(--red)"></i>Libre</span><span><i style="background:var(--ok)"></i>Pillado</span></div>
    <div class="weeknav"><button class="iconbtn" data-week="-1" ${A.week === 0 ? "disabled" : ""} aria-label="Semana anterior">‹</button>
      <div style="text-align:center"><b>${lbl}</b><div class="muted small">${esc(weekRange(ymd(t0)))}</div></div>
      <button class="iconbtn" data-week="1" ${A.week >= 5 ? "disabled" : ""} aria-label="Semana siguiente">›</button></div>
    <div class="list">${days}</div>
    <div class="card"><b>Enlace para pedir corte</b><span class="muted small">Para el grupo de WhatsApp o para alguien nuevo. Les pide nombre y móvil.</span>
      <div class="copybox">${esc(origin() + "/")}</div>
      <div class="row"><a class="btn wa sm" href="${wa("", `💈 CabezApp ya está aquí. Pide tu corte para esta semana (y mira las reseñas):\n${origin()}/`)}" target="_blank" rel="noopener">${ICON.wa} Mandar por WhatsApp</a>
      <button class="btn ghost sm" data-copy="${esc(origin() + "/")}">Copiar</button></div></div>`;
}

// Each day saves on its own; edits not yet saved survive the server's reply to another day
const saveTimers = {}, pendingAvail = {};
function queueAvailability(d) {
  pendingAvail[d] = A.db.availability[d] || [];
  clearTimeout(saveTimers[d]);
  saveTimers[d] = setTimeout(async () => {
    const hours = pendingAvail[d];
    try {
      await adminCall("availability", { d, hours });
      if (pendingAvail[d] === hours) delete pendingAvail[d];
      Object.entries(pendingAvail).forEach(([k, v]) => { if (v.length) A.db.availability[k] = v; else delete A.db.availability[k]; });
      toast("Huecos guardados");
      if (A.tab === "horario") drawAdmin();
    } catch {}
  }, 700);
}

function paneClientes(el) {
  const db = A.db, s = db.settings;
  const list = [...db.clients].sort((a, b) => a.name.localeCompare(b.name, "es"));
  el.innerHTML = `
    <form class="card" id="newc">
      <h3>Nuevo cliente</h3>
      <div class="grid2"><div><label class="fl" for="nc-name">Nombre</label><input class="field" id="nc-name" maxlength="40" required placeholder="Pablo Martín"></div>
      <div><label class="fl" for="nc-nick">Mote</label><input class="field" id="nc-nick" maxlength="30" placeholder="El Rubio"></div>
      <div><label class="fl" for="nc-phone">Móvil</label><input class="field" id="nc-phone" type="tel" inputmode="tel" placeholder="600 123 456"></div>
      <div><label class="fl" for="nc-cuts">Cortes que ya tiene</label><input class="field" id="nc-cuts" type="number" inputmode="numeric" min="0" max="50" value="0"></div></div>
      <p class="muted small" style="margin:0">Pon los cortes que tenga pendientes de antes. Si compra un bono nuevo, usa «+ Bono» en su ficha.</p>
      <button class="btn primary">Añadir</button>
    </form>
    <div class="section"><div class="section-head"><h2>Clientes</h2><span class="muted small">${list.length}</span></div>
    <div class="list">${list.length ? list.map((c) => clientCard(c, s)).join("") : `<p class="empty">Todavía no hay nadie. Añade al primero o pasa el enlace general.</p>`}</div></div>`;
}

function clientCard(c, s) {
  const dots = c.total ? Array.from({ length: Math.min(c.total, 10) }, (_, i) => `<span class="${i < c.used ? "u" : ""}"></span>`).join("") : "";
  const link = personalLink(c.token);
  return `<details class="item client" ${A.openClient === c.id ? "open" : ""} data-client="${c.id}">
    <summary class="item-row"><div class="grow"><div class="name">${esc(fullName(c))}</div>
      <div class="muted small">${c.total ? `<span class="mini">${dots}</span> ${c.remaining} de ${c.total}` : "Sin cortes"}${c.phone ? "" : " · sin móvil"}</div></div>
      <span class="status ${c.remaining ? "st-confirmada" : "st-cancelada"}">${c.remaining} ${c.remaining === 1 ? "corte" : "cortes"}</span></summary>
    <div class="body">
      <div class="row">
        ${c.phone ? `<a class="btn ok sm" href="${wa(c.phone, bonoMsg(c, s))}" target="_blank" rel="noopener" data-cact="add-bono" data-id="${c.id}">+ Bono (${s.bonoPrice} €)</a>`
          : `<button class="btn ok sm" data-cact="add-bono" data-id="${c.id}">+ Bono (${s.bonoPrice} €)</button>`}
        <button class="btn ghost sm" data-cact="adjust" data-delta="1" data-id="${c.id}" ${c.remaining ? "" : "disabled"}>Gastar 1</button>
        <button class="btn ghost sm" data-cact="adjust" data-delta="-1" data-id="${c.id}" ${c.used ? "" : "disabled"}>Devolver 1</button>
      </div>
      <div><span class="eyebrow">Añadir cortes sueltos</span>
        <div class="row addcuts"><input class="field" id="ac-${c.id}" type="number" inputmode="numeric" min="1" max="50" value="1" aria-label="Cortes">
        <input class="field" id="ap-${c.id}" type="number" inputmode="decimal" min="0" step="0.5" placeholder="€" aria-label="Pagado (opcional)">
        <button class="btn ok sm" data-cact="add-cuts" data-id="${c.id}">Añadir</button></div></div>
      <div><span class="eyebrow">Su PIN para entrar en la app</span>
        <div class="row addcuts"><b class="pin">${esc(c.pin || "—")}</b>
        <input class="field" id="pp-${c.id}" inputmode="numeric" maxlength="4" placeholder="Otro (opcional)" aria-label="PIN nuevo">
        <button class="btn ghost sm" data-cact="new-pin" data-id="${c.id}">Cambiar PIN</button></div></div>
      <div><span class="eyebrow">Su enlace personal</span><div class="copybox">${esc(link)}</div></div>
      <div class="row">
        ${c.phone ? `<a class="btn wa sm" href="${wa(c.phone, linkMsg(c))}" target="_blank" rel="noopener">${ICON.wa} Mandarle su enlace</a>` : ""}
        <button class="btn ghost sm" data-copy="${esc(link)}">Copiar enlace</button>
      </div>
      ${c.bonos.length ? `<div class="muted small">Cortes cargados: ${c.bonos.map((b) => `${new Date(b.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}: ${b.cuts}${b.price ? ` (${b.price} €)` : b.kind === "previos" ? " (de antes)" : ""} <button class="linkbtn" data-cact="remove-bono" data-id="${c.id}" data-bono="${b.id}">quitar</button>`).join(" · ")}</div>` : ""}
      <div class="grid2"><div><label class="fl" for="en-${c.id}">Nombre</label><input class="field" id="en-${c.id}" value="${esc(c.name)}" maxlength="40"></div>
      <div><label class="fl" for="ek-${c.id}">Mote</label><input class="field" id="ek-${c.id}" value="${esc(c.nick || "")}" maxlength="30"></div>
      <div><label class="fl" for="ep-${c.id}">Móvil</label><input class="field" id="ep-${c.id}" type="tel" value="${esc(c.phone)}"></div></div>
      ${A.db.clients.length > 1 ? `<div><label class="fl" for="mg-${c.id}">¿Es la misma persona que otro cliente?</label>
        <div class="row"><select class="field" id="mg-${c.id}" style="flex:2 1 160px"><option value="">Elige con quién unirlo…</option>${A.db.clients.filter((x) => x.id !== c.id).sort((a, b) => a.name.localeCompare(b.name, "es")).map((x) => `<option value="${x.id}">${esc(fullName(x))}${x.phone ? " · …" + esc(x.phone.slice(-3)) : ""}</option>`).join("")}</select>
        <button class="btn ghost sm" data-cact="merge" data-id="${c.id}">Unir</button></div>
        <p class="muted small" style="margin:4px 0 0">Sus pedidos, bonos y reseña pasan al elegido, y esta ficha se borra.</p></div>` : ""}
      <div class="row"><button class="btn ghost sm" data-cact="edit-client" data-id="${c.id}">Guardar datos</button>
      <button class="btn danger sm" data-cact="delete-client" data-id="${c.id}">Borrar cliente</button></div>
    </div></details>`;
}

function paneResenas(el) {
  const list = [...A.db.reviews].sort((a, b) => b.date.localeCompare(a.date));
  const vis = list.filter((r) => !r.hidden);
  const avg = vis.length ? vis.reduce((a, r) => a + r.stars, 0) / vis.length : 0;
  el.innerHTML = `
    <div class="score"><b>${avg ? avg.toFixed(1).replace(".", ",") : "–"}</b><div>${stars(Math.round(avg))}<div class="muted small">${vis.length} visibles</div></div></div>
    <div class="list">${list.length ? list.map((r) => `<div class="review${r.hidden ? " hidden-r" : ""}">
      <div class="item-row"><b class="grow">${esc(clientById(r.clientId).name)}</b>${stars(r.stars)}</div>
      ${r.text ? `<p>${esc(r.text)}</p>` : ""}
      <div class="row"><button class="btn ghost sm" data-rv="${r.id}" data-hide="${r.hidden ? 0 : 1}">${r.hidden ? "Volver a mostrar" : "Ocultar"}</button></div>
    </div>`).join("") : `<p class="empty">Sin reseñas todavía. Cuando marcas un corte como hecho, el WhatsApp les pide una.</p>`}</div>`;
}

function paneAjustes(el) {
  const s = A.db.settings;
  el.innerHTML = `
    <form class="card" id="cfg">
      <h3>Tu WhatsApp</h3>
      <input class="field" id="cf-phone" type="tel" inputmode="tel" value="${esc(s.adminPhone)}" placeholder="600 123 456">
      <p class="muted small" style="margin:0">Los colegas te avisan aquí cuando piden corte o pillan hueco.</p>
      <h3>Precios</h3>
      <div class="grid2">
        <div><label class="fl" for="cf-cuts">Cortes por bono</label><input class="field" id="cf-cuts" type="number" min="1" max="20" value="${s.cutsPerBono}"></div>
        <div><label class="fl" for="cf-price">Precio bono (€)</label><input class="field" id="cf-price" type="number" min="0" step="0.5" value="${s.bonoPrice}"></div>
        <div><label class="fl" for="cf-loose">Corte suelto (€)</label><input class="field" id="cf-loose" type="number" min="0" step="0.5" value="${s.loosePrice}"></div>
      </div>
      <h3>Aviso legal de la confirmación</h3>
      <textarea class="field" id="cf-text" maxlength="400">${esc(s.confirmText)}</textarea>
      <button class="btn primary">Guardar ajustes</button>
    </form>
    ${installCard("Tu panel en la pantalla de inicio.")}
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

function wireAdmin() {
  app.addEventListener("click", async (e) => {
    if (!A.db || route() !== "admin") return;
    const t = e.target.closest("button, a");
    if (!t || t.hasAttribute("data-install-btn")) return;
    const ds = t.dataset;
    if (ds.tab) { A.tab = ds.tab; drawAdmin(); window.scrollTo(0, 0); return; }
    if (ds.copy) { copy(ds.copy, "Enlace copiado"); return; }
    if (ds.openClient) { A.tab = "clientes"; A.openClient = ds.openClient; drawAdmin(); return; }
    if (ds.week) { A.week = Math.max(0, A.week + +ds.week); drawAdmin(); return; }
    if (ds.slot && ds.cid) {
      const set = A.sel[ds.cid] || (A.sel[ds.cid] = new Set());
      set.has(ds.slot) ? set.delete(ds.slot) : set.add(ds.slot);
      drawAdmin(); return;
    }
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
      const body = { id: ds.id };
      if (ds.act === "offer") body.slots = [...(A.sel[ds.id] || [])];
      if (ds.act === "assign") body.slot = ds.slot;
      try {
        await adminCall(ds.act, body);
        delete A.sel[ds.id];
        toast({ offer: "Huecos enviados", assign: "Corte confirmado", reject: "Rechazado", done: "Corte apuntado", cancel: "Cancelado", "undo-done": "Deshecho", sent: "Confirmación marcada" }[ds.act] || "Hecho");
        drawAdmin();
      } catch {}
      return;
    }
    if (ds.cact) {
      A.openClient = ds.id;
      let body = { id: ds.id };
      if (ds.cact === "adjust") body.delta = +ds.delta;
      if (ds.cact === "remove-bono") body.bonoId = ds.bono;
      if (ds.cact === "edit-client") body = { id: ds.id, name: $("#en-" + ds.id).value, nick: $("#ek-" + ds.id).value, phone: $("#ep-" + ds.id).value };
      if (ds.cact === "new-pin") body = { id: ds.id, pin: $("#pp-" + ds.id).value };
      if (ds.cact === "add-cuts") body = { id: ds.id, cuts: $("#ac-" + ds.id).value, price: $("#ap-" + ds.id).value };
      if (ds.cact === "delete-client" && ds.sure !== "1") { ds.sure = "1"; t.textContent = "Se borra todo. ¿Seguro?"; return; }
      if (ds.cact === "merge") {
        body.into = $("#mg-" + ds.id).value;
        if (!body.into) return toast("Elige con quién unirlo", true);
        if (ds.sure !== "1") { ds.sure = "1"; t.textContent = "¿Seguro? Toca otra vez"; return; }
      }
      try {
        await adminCall(ds.cact, body);
        if (ds.cact === "delete-client") A.openClient = null;
        if (ds.cact === "merge") A.openClient = body.into;
        toast({ "add-bono": "Bono añadido", adjust: "Apuntado", "edit-client": "Guardado", "delete-client": "Cliente borrado", "remove-bono": "Quitado", merge: "Clientes unidos", "add-cuts": "Cortes añadidos", "new-pin": "PIN cambiado" }[ds.cact]);
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
      const r = await adminCall("add-client", { name: $("#nc-name").value, nick: $("#nc-nick").value, phone: $("#nc-phone").value, cuts: $("#nc-cuts").value });
      A.openClient = r.result.client.id;
      toast("Cliente añadido. Mándale su enlace y su PIN.");
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
