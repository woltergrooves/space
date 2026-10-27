// Long Race — M1: hangar → lancering → baan → missie → terugkeer → rapport → verbeteren.
import * as THREE from 'three';
import { World } from './world.js';
import { FlightSim, analyze, elements, R, MU, ATM_TOP, SPACE, SAFE_PE, TARGET_APO } from './physics.js';
import { ENGINES, BOOSTER_ENGINES, MISSIONS, MAX_TANKS, MAX_STAGES, reliability, testCost, dateName } from './data.js';
import * as P from './program.js';

const $ = (s) => document.querySelector(s);
const fmt = (n, d = 0) => n.toLocaleString('nl-NL', { maximumFractionDigits: d, minimumFractionDigits: d });
const km = (m) => (Math.abs(m) >= 1e6 ? '∞' : fmt(m / 1000, 1)) + ' km';
const pct = (x) => fmt(x * 100, 0) + '%';
const NEED_DV = 5850; // ongeveer nodig voor baan + terugkeer met dit ontwerp-type

const prog = P.load();
const world = new World($('#c'));
world.setQuality(prog.quality ?? 1);
let screen = null, sim = null, flightPhoto = null, lastHud = 0, msgs = [], rep0 = null;

function toast(t, ms = 2800) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), ms); }
function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id); screen = id; }
const persist = () => { if (sim && screen === 'flight' && !sim.s.outcome) prog.flight = sim.s; P.save(prog); };
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
addEventListener('pagehide', persist);
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ================= HANGAR =================
function mission() { return P.missionById(prog.mission); }
function enterHangar() {
  show('hangar'); sim = new FlightSim(prog.design, mission(), prog.heritage);
  world.setRocket(prog.design, !!mission().sat);
  const H = world.rocket.capsuleBase + 4;
  world.controls.set({ target: new THREE.Vector3(0, H / 2, 0), yaw: -0.6, pitch: 0.08, dist: H * 0.9 + 14 }, !hangarCamSet);
  hangarCamSet = true;
  renderHangar();
}
let hangarCamSet = false;
function renderHangar() {
  const m = mission(), a = analyze(prog.design, !!m.sat), cost = P.designCost(prog.design, m);
  $('#h-top').innerHTML = `<div><div class="tag">ERO · Europa</div><b>${dateName(prog.month)}</b></div>
    <div style="text-align:right"><div class="tag">Budget</div><b class="mono">${fmt(prog.budget)} Mio</b></div>`;
  $('#h-missions').innerHTML = MISSIONS.map((x) => {
    const ok = P.missionAvailable(prog, x), done = prog.done.includes(x.id);
    return `<button class="mcard panel ${x.id === prog.mission ? 'sel' : ''}" data-m="${x.id}" ${ok ? '' : 'disabled'}>
      <b>${done ? '✓ ' : ''}${x.name}</b><small>${ok ? x.desc : 'Eerst: ' + P.missionById(x.req).name}</small>
      <span class="rw">${x.reward ? (done ? 'herhaling: ' + Math.round(x.reward / 2) : '+' + x.reward) + ' Mio' : 'ervaring'}</span></button>`;
  }).join('');
  const st = prog.design.stages, rows = [];
  rows.push(`<div class="row"><div class="nm">Kievit-capsule + servicemodule${m.sat ? ' + satelliet Merel' : ''}<small>OMS ${fmt(a.stages.at(-1).dv)} m/s · hitteschild · parachute</small></div></div>`);
  for (let i = st.length - 1; i >= 0; i--) {
    const s = st[i], e = ENGINES[s.engine], an = a.stages[i];
    const rel = reliability(s.engine, prog.heritage);
    rows.push(`<div class="row"><div class="nm"><b>Trap ${i + 1}</b> · ${e.name}<small>${fmt(an.dv)} m/s · TWR ${fmt(an.twr, 2)} · betrouwbaar ${pct(rel)}</small></div>
      <button data-eng="${i}">Motor</button><button data-tk="${i}" data-d="-1">−</button><span class="cnt">${s.tanks}</span><button data-tk="${i}" data-d="1">+</button>
      ${st.length > 1 ? `<button data-rm="${i}">✕</button>` : ''}</div>`);
  }
  const boost = a.stages.slice(0, -1), total = a.total, scale = Math.max(total, NEED_DV) * 1.08;
  const colors = ['#c9874a', '#e8a83a', '#f3d28a', '#7aa7e0'];
  let x = 0; const segs = a.stages.map((s, i) => { const w = s.dv / scale * 100, seg = `<i style="left:${x}%;width:${w}%;background:${i === a.stages.length - 1 ? colors[3] : colors[i % 3]}"></i>`; x += w; return seg; }).join('');
  const warns = [];
  if (a.stages[0].twr < 1.02) warns.push('Trap 1 komt niet van de grond (TWR onder 1). Meer stuwkracht of minder tanks.');
  else if (a.stages[0].twr < 1.2) warns.push('Trap 1 is traag (TWR < 1,2): veel verlies aan zwaartekracht.');
  if (total < NEED_DV) warns.push(`Te weinig Δv voor een baan én terugkeer (≈ ${fmt(NEED_DV)} m/s nodig).`);
  boost.forEach((s, i) => { if (i > 0 && s.twr < 0.5) warns.push(`Trap ${i + 1} is erg zwak (TWR ${fmt(s.twr, 2)}): kan terugvallen.`); });
  const canPay = prog.budget >= cost;
  $('#h-sheet').innerHTML = `${rows.join('')}
    ${st.length < MAX_STAGES ? '<button data-add="1" style="width:100%;margin-top:8px">+ Trap toevoegen onderaan</button>' : ''}
    <div class="dvbar">${segs}<span class="need" style="left:${NEED_DV / scale * 100}%"></span></div>
    <div class="stats"><span>Δv <b class="mono" style="color:${total >= NEED_DV ? 'var(--green)' : 'var(--red)'}">${fmt(total)}</b> / ${fmt(NEED_DV)} m/s</span><span>Massa <span class="mono">${fmt(a.mass / 1000, 1)} t</span></span></div>
    ${warns.map((w) => `<div class="warn">⚠ ${w}</div>`).join('')}
    <button class="launch primary" data-launch="1" ${canPay ? '' : 'disabled'}>Lanceer ${prog.design.name} · ${cost} Mio</button>
    ${canPay ? '' : '<button data-loan="1" style="width:100%;margin-top:8px">Noodbudget aanvragen (+40 Mio, reputatie −5)</button>'}
    <div style="display:flex;gap:8px;margin-top:8px"><button data-q="1" style="flex:1">Kwaliteit: ${['Laag', 'Middel', 'Hoog'][world.quality]}</button><button data-chron="1" style="flex:1">Kroniek (${prog.chronicle.length})</button></div>`;
}
$('#hangar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset, st = prog.design.stages;
  if (d.m) { prog.mission = d.m; enterHangar(); }
  else if (d.eng) { const s = st[+d.eng]; s.engine = BOOSTER_ENGINES[(BOOSTER_ENGINES.indexOf(s.engine) + 1) % BOOSTER_ENGINES.length]; changed(); toast(`${ENGINES[s.engine].name}: ${ENGINES[s.engine].role}`); }
  else if (d.tk) { const s = st[+d.tk]; s.tanks = Math.max(1, Math.min(MAX_TANKS, s.tanks + +d.d)); changed(); }
  else if (d.rm) { st.splice(+d.rm, 1); changed(); }
  else if (d.add) { st.unshift({ engine: 'vesta', tanks: 3 }); changed(); }
  else if (d.launch) launch();
  else if (d.loan) { prog.budget += 40; prog.rep = Math.max(0, prog.rep - 5); P.save(prog); renderHangar(); }
  else if (d.q) { world.setQuality((world.quality + 1) % 3); prog.quality = world.quality; P.save(prog); renderHangar(); }
  else if (d.chron) showChronicle();
});
function changed() { prog.design.name = prog.design.name || 'Lansier'; P.save(prog); enterHangar(); }

function showChronicle() {
  const el = $('#report'); show('report');
  el.innerHTML = `<div class="paper"><div class="tag">Kroniek van het programma</div><h1>Onze geschiedenis</h1>
    ${prog.chronicle.length ? '' : '<p class="dim">Nog geen vluchten. Je eerste lancering wordt hier vastgelegd.</p>'}
    ${prog.chronicle.slice().reverse().map((c) => `<div class="panel" style="padding:12px;margin:10px 0">
      <div class="tag">Vlucht ${c.no} · ${c.date}</div><b>${c.name} — ${c.mission}</b>
      <div class="${c.success ? '' : 'dim'}">${c.success ? '✓ Geslaagd' : c.recovered ? 'Doel niet gehaald, capsule geborgen' : '✕ Capsule verloren'}${c.sat ? ' · Merel draait nog rond de aarde' : ''}</div>
      ${c.photo ? `<img class="photo" style="margin-top:10px" src="${c.photo}">` : ''}</div>`).join('')}
    <button class="launch" data-back="1">Terug naar de hangar</button></div>`;
  el.querySelector('[data-back]').onclick = enterHangar;
}

// ================= VLUCHT =================
function launch() {
  const m = mission(), cost = P.designCost(prog.design, m);
  prog.budget -= cost; flightPhoto = null;
  sim = new FlightSim(structuredClone(prog.design), m, prog.heritage);
  startFlight();
  addMsg(m.id === 'test' ? 'Testvlucht. Schuif het gas omhoog om te lanceren.' : `Missie: ${m.name}. Schuif het gas (links) omhoog om te lanceren.`, 'info', 6000);
}
function startFlight() {
  show('flight'); sim.warp = 1; sim.warpSel = 1; msgs = []; $('#f-ticker').innerHTML = '';
  world.setRocket(sim.s.design, sim.s.withSat); world.applyState(sim);
  sim.onEvent = (t, k) => addMsg(t, k);
  sim.onStage = (i) => world.separate(sim, i);
  world.camMode = 'rocket';
  world.controls.set({ target: new THREE.Vector3(0, 15, 0), yaw: -0.9, pitch: 0.05, dist: 45 }, true);
  if (sim.s.eva) { world.startEva(); world.camMode = 'astro'; }
  persist();
}
function addMsg(text, kind = 'info', ms = 5000) {
  const el = document.createElement('div'); el.className = `msg panel ${kind}`; el.textContent = text;
  const box = $('#f-ticker'); box.prepend(el); while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 700); }, kind === 'warn' || kind === 'bad' ? Math.max(ms, 7000) : ms);
  if (kind === 'warn' || kind === 'bad') navigator.vibrate?.(120);
}

// Gashendel
const thr = $('#f-thr');
function thrFromEvent(e) { const r = thr.getBoundingClientRect(); sim.setThrottle(1 - (e.clientY - r.top - 6) / (r.height - 12)); }
thr.addEventListener('pointerdown', (e) => { thr.setPointerCapture(e.pointerId); thrFromEvent(e); });
thr.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') if (thr.hasPointerCapture(e.pointerId)) thrFromEvent(e); });
for (const b of document.querySelectorAll('[data-steer]')) {
  b.addEventListener('pointerdown', () => { sim.s.steer = +b.dataset.steer; });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { sim.s.steer = 0; });
}
$('#b-assist').onclick = () => { sim.setAssist(!sim.s.assist); toast(sim.s.assist ? 'Assistent stuurt de houding' : 'Handbesturing: gebruik ⟲ ⟳'); };
const WARPS = [1, 10, 50, 200];
$('#b-warp').onclick = () => { sim.warpSel = WARPS[(WARPS.indexOf(sim.warpSel) + 1) % WARPS.length]; if (maxWarp() === 1 && sim.warpSel > 1) toast('Tijdversnelling kan alleen boven de atmosfeer met de motor uit'); };
$('#b-photo').onclick = () => { const eva = sim.s.eva; if (eva) sim.s.objectives.photo = true; world.photoReq = (url) => { flightPhoto = url; if (rep0) rep0.photo = url; toast(eva ? '📷 Foto van de ruimtewandeling gemaakt!' : '📷 Foto bewaard voor het verslag'); }; };
$('#b-menu').onclick = () => {
  const el = $('#f-acts'); el.innerHTML = `<button data-a="resume">Verder vliegen</button><button data-a="cam">Camera: ${world.camMode === 'astro' ? 'astronaut' : 'raket'}</button><button class="danger" data-a="scrub">Vlucht afbreken (verlies)</button>`;
  menuOpen = true;
};
let menuOpen = false;
$('#f-acts').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a, s = sim.s;
  menuOpen = false;
  if (a === 'stage') { if (s.phase === 'pad') return toast('Eerst lanceren: schuif het gas omhoog'); sim.stageSep(); }
  else if (a === 'circ') { s.mode = 'circ'; s.burning = false; if (!s.assist) sim.setAssist(true), s.mode = 'circ'; addMsg('Autopiloot: circuleren bij het hoogste punt. De tijd versnelt automatisch.'); }
  else if (a === 'deorbit') { s.mode = 'deorbit'; if (!s.assist) { s.assist = true; } addMsg('Autopiloot: terugkeerbrand. Neus draait naar achteren.'); }
  else if (a === 'sat') { if (sim.releaseSat()) world.releaseSat(sim); }
  else if (a === 'eva') { s.eva = true; s.evaStart = s.met; world.startEva(); world.camMode = 'astro'; world.controls.set({ target: world.astroHead(), yaw: 0.3, pitch: 0.05, dist: 3 }); addMsg('Luik open. Maak een foto (📷) en kom weer binnen.'); }
  else if (a === 'evaEnd') { s.eva = false; s.objectives.eva = s.met - (s.evaStart || 0) > 5; world.endEva(); world.camMode = 'rocket'; world.controls.goal.dist = 30; addMsg(s.objectives.photo ? 'Astronaut weer binnen. Missiedoel gehaald!' : 'Astronaut weer binnen (nog geen foto gemaakt).', s.objectives.photo ? 'good' : 'warn'); }
  else if (a === 'chute') sim.deployChute();
  else if (a === 'cam') { if (world.astro) world.camMode = world.camMode === 'astro' ? 'rocket' : 'astro'; world.controls.goal.dist = world.camMode === 'astro' ? 3 : 30; }
  else if (a === 'scrub') { sim.lose('Vlucht afgebroken door de vluchtleiding'); }
  lastHud = 0;
});

function maxWarp() {
  const s = sim.s; if (s.phase !== 'flying' || s.eva) return 1;
  if (sim.alt < ATM_TOP + 500 || s.throttle > 0 || s.burning) return 1;
  return 200;
}
function autoWarp() {
  const s = sim.s, mw = maxWarp(); if (mw === 1) return 1;
  if (s.mode === 'circ' && !s.burning) { const o = sim.orbit; const t = o.tApo; return t > 400 ? 200 : t > 80 ? 50 : t > 20 ? 10 : 1; }
  if (s.mode === 'reentry' || (s.mode === 'deorbit' && s.throttle === 0 && sim.orbit.pe < 25000)) {
    const vv = sim.vVert; if (vv < -1) { const t = (sim.alt - ATM_TOP) / -vv; return t > 300 ? 200 : t > 60 ? 50 : t > 15 ? 10 : 1; }
    return 200;
  }
  return Math.min(sim.warpSel, mw);
}

function actions() {
  const s = sim.s, A = [], o = sim.alt > 30000 ? sim.orbit : null;
  if (menuOpen) return null;
  if (s.phase === 'pad') return [{ a: 'stage', l: 'Gas omhoog = lancering', dis: true }];
  if (s.eva) return [{ a: 'evaEnd', l: 'Naar binnen' }];
  if (o && !s.objectives.orbit && s.mode === 'coast' && sim.alt > SPACE - 15000 && o.apo > SPACE) A.push({ a: 'circ', l: 'Circuleren bij hoogste punt', p: true });
  if (s.objectives.orbit && o && o.pe > SPACE) {
    if (s.mission === 'eva' && !s.objectives.photo && sim.canEva()) A.push({ a: 'eva', l: 'Ruimtewandeling', p: true });
    if (s.withSat && !s.satReleased && sim.hasSM) A.push({ a: 'sat', l: 'Zet Merel uit', p: true });
    if (sim.hasSM && s.mode !== 'deorbit' && sim.stage.prop > 0) A.push({ a: 'deorbit', l: 'Terugkeer inzetten', p: missionDone() });
  }
  if (sim.canDeployChute()) A.push({ a: 'chute', l: 'Parachute', p: true });
  const next = s.stages[s.si + 1];
  if (next) A.push({ a: 'stage', l: s.stages[s.si].kind === 'sm' ? 'SCHEID SERVICEMODULE' : 'SCHEIDEN', stage: true, hot: stageHot() });
  return A;
}
function missionDone() { const ob = sim.s.objectives; return { orbit: ob.orbit, eva: ob.photo && ob.eva, sat: ob.sat, test: true }[sim.s.mission]; }
function stageHot() {
  const s = sim.s, st = sim.stage;
  if (st.kind === 'booster' && (st.prop <= 0 || s.eng[s.si]?.failed)) return true;
  return st.kind === 'sm' && sim.alt < 60000 && sim.vVert < 0 && (!sim.orbit || sim.orbit.pe < 30000);
}

function renderActs() {
  const A = actions(); if (!A) return;
  const html = A.map((x) => `<button data-a="${x.a}" class="${x.stage ? 'stage' : ''} ${x.p || x.hot ? 'primary' : ''}" ${x.dis ? 'disabled' : ''}>${x.l}</button>`).join('');
  const box = $('#f-acts'); if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
}

function renderHud() {
  const s = sim.s, alt = sim.alt, o = alt > 20000 && s.phase === 'flying' ? sim.orbit : null;
  const mm = Math.floor(s.met / 60), ss = Math.floor(s.met % 60);
  const es = s.eng[s.si];
  let status = s.phase === 'pad' ? 'Op het platform' : s.phase === 'landed' ? 'Geland' : s.eva ? 'Ruimtewandeling' : s.objectives.orbit && o && o.pe > SPACE ? 'In een baan' : alt > SPACE ? 'Ruimte' : 'Atmosfeer';
  $('#f-info').innerHTML = `<div class="tag">${s.design.name} · T+${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} · ${status}</div>
    <div class="big">${km(alt)} · ${fmt(sim.speed)} m/s</div>
    ${o ? `<div class="mono">↑ ${km(o.apo)} &nbsp;↓ <span style="color:${o.pe >= SAFE_PE ? 'var(--green)' : o.pe > 0 ? 'var(--amber)' : 'var(--dim)'}">${o.pe < -R / 2 ? '—' : km(o.pe)}</span></div>` : `<div class="mono dim">${fmt(sim.vVert)} m/s verticaal</div>`}
    <div class="mono dim">${fmt(s.g, 1)} g · ${sim.stage.engine ? ENGINES[sim.stage.engine].name + ' ' + pct(sim.stage.propMax ? sim.stage.prop / sim.stage.propMax : 0) : 'capsule'}${es?.limited ? ' · max 70%' : ''}${es?.failed ? ' · UIT' : ''}</div>
    ${s.flux > 30 || (sim.capsuleOnly && s.shield < 100) ? `<div class="dim" style="font-size:12px">Hitteschild ${fmt(Math.max(0, s.shield))}%</div><div class="meter"><i style="width:${Math.max(0, s.shield)}%;background:${s.shield < 30 ? 'var(--red)' : 'var(--amber)'}"></i></div>` : ''}`;
  thr.querySelector('.fill').style.height = `calc(${s.throttle * 100}% - ${s.throttle * 12}px)`;
  thr.querySelector('.lbl').textContent = pct(s.throttle);
  const lim = thr.querySelector('.lim'); lim.style.display = es?.limited || (es?.warned && !es.saved && !es.failed) ? 'block' : 'none'; lim.style.bottom = `calc(70% - 3px)`;
  $('#b-assist').textContent = s.assist ? 'Assist ✓' : 'Assist ✕';
  $('#b-assist').classList.toggle('primary', !s.assist);
  $('#f-steer').classList.toggle('on', !s.assist);
  $('#b-warp').textContent = `⏩ ×${sim.warp}`;
  renderActs(); drawMap(o);
}

// Profielkaart: hoogte langs de baan vooruit (360°), atmosfeer en grond
const mapC = $('#f-map canvas'), mg = mapC.getContext('2d');
function drawMap() {
  const W = mapC.width, H = mapC.height, s = sim.s; mg.clearRect(0, 0, W, H);
  const r = Math.hypot(s.p[0], s.p[1]), v2 = s.v[0] ** 2 + s.v[1] ** 2, hh = s.p[0] * s.v[1] - s.p[1] * s.v[0], rv = s.p[0] * s.v[0] + s.p[1] * s.v[1];
  const ex = ((v2 - MU / r) * s.p[0] - rv * s.v[0]) / MU, ey = ((v2 - MU / r) * s.p[1] - rv * s.v[1]) / MU;
  const e = Math.hypot(ex, ey), w = Math.atan2(ey, ex), pp = hh * hh / MU, phi = Math.atan2(s.p[1], s.p[0]);
  const o = s.phase === 'flying' ? elements(s.p, s.v) : null;
  const top = Math.max(110000, Math.min(400000, (o && isFinite(o.apo) ? o.apo : sim.alt) * 1.25));
  const Y = (a) => H - 14 - (a / top) * (H - 24);
  mg.fillStyle = 'rgba(122,167,224,0.10)'; mg.fillRect(0, Y(ATM_TOP), W, Y(0) - Y(ATM_TOP));
  mg.strokeStyle = 'rgba(122,167,224,0.5)'; mg.setLineDash([4, 4]); mg.beginPath(); mg.moveTo(0, Y(ATM_TOP)); mg.lineTo(W, Y(ATM_TOP)); mg.stroke(); mg.setLineDash([]);
  mg.fillStyle = '#2d4a33'; mg.fillRect(0, Y(0), W, H - Y(0));
  mg.fillStyle = 'rgba(241,234,217,0.6)'; mg.font = '18px sans-serif'; mg.fillText('70 km', 6, Y(ATM_TOP) - 4);
  if (s.phase === 'flying' && Math.abs(hh) > 1) {
    mg.strokeStyle = '#f3d28a'; mg.lineWidth = 3; mg.beginPath(); let started = false;
    for (let i = 0; i <= 180; i++) {
      const th = phi + i / 180 * 2 * Math.PI * Math.sign(hh), den = 1 + e * Math.cos(th - w);
      if (den <= 0) break; const a = pp / den - R; if (a < 0 && i > 0) { mg.lineTo(i / 180 * W, Y(0)); break; }
      const X = i / 180 * W; started ? mg.lineTo(X, Y(Math.min(a, top * 1.2))) : mg.moveTo(X, Y(a)); started = true;
    }
    mg.stroke();
  }
  mg.fillStyle = '#fff'; mg.beginPath(); mg.arc(4, Y(Math.max(0, sim.alt)), 6, 0, 7); mg.fill();
}

// ================= RAPPORT =================
function finishFlight() {
  const rep = rep0 = P.applyFlight(prog, sim, flightPhoto); P.save(prog);
  setTimeout(() => showReport(rep), sim.s.phase === 'landed' ? 2500 : 1800);
}
function showReport(rep) {
  show('report'); const el = $('#report'), o = rep.outcome;
  const verdict = o.success ? ['Missie geslaagd', 'var(--green)'] : o.recovered ? ['Bemanning veilig terug, doel niet gehaald', 'var(--amber)'] : ['Capsule verloren', 'var(--red)'];
  const cap = rep.photo ? (o.success && rep.mission.id === 'eva' ? '“Europeaan zweeft boven de wereld” — de foto die morgen in elke krant staat.' : 'Foto van de vlucht.') : '';
  const earned = rep.money.reduce((a, [, v]) => a + v, 0);
  el.innerHTML = `<div class="paper">
    <div class="tag">Vluchtrapport · ${rep.date}</div><h1>${rep.name} — ${rep.mission.name}</h1>
    <span class="verdict" style="background:${verdict[1]};color:#14110a">${verdict[0]}</span>
    ${rep.photo ? `<h2>Krantenfoto</h2><img class="photo" src="${rep.photo}"><div class="cap">${cap}</div>` : ''}
    <h2>Telemetrie</h2><canvas id="r-plot" width="1000" height="360" style="width:100%;height:auto" class="panel"></canvas>
    <div class="dim" style="font-size:13px;margin-top:4px">Hoogte (oranje) en snelheid (blauw) · max ${fmt(rep.maxG, 1)} g · hitteschild over: ${fmt(Math.max(0, rep.shield))}%</div>
    <h2>Logboek</h2>${rep.events.map((e) => `<div class="ev ${e.kind}"><span class="t">T+${fmt(Math.floor(e.t / 60))}:${String(Math.floor(e.t % 60)).padStart(2, '0')}</span><span>${e.text}</span></div>`).join('')}
    <h2>Vlieg-erfgoed</h2>${rep.heritage.map((h) => `<div class="money"><span>${h.name}${h.data ? ' · storingsdata verzameld' : ''}</span><span class="mono">${pct(h.before)} → <b style="color:var(--green)">${pct(h.after)}</b></span></div>`).join('')}
    <h2>Budget</h2>${rep.money.map(([t, v]) => `<div class="money"><span>${t}</span><span class="mono">+${v}</span></div>`).join('')}
    <div class="money"><b>Nieuw budget</b><b class="mono">${fmt(prog.budget)} Mio</b></div>
    <h2>Verbeteren: grondtests</h2><div id="r-tests"></div>
    <button class="launch primary" id="r-back">Naar de hangar</button></div>`;
  void earned;
  drawPlot(rep.samples);
  renderTests(rep);
  $('#r-back').onclick = enterHangar;
}
function renderTests(rep) {
  const ids = [...new Set([...rep.heritage.map((h) => h.id), ...prog.design.stages.map((s) => s.engine)])].filter((id) => id !== 'oms');
  $('#r-tests').innerHTML = `<p class="dim" style="font-size:13px;margin:0 0 6px">Een testcampagne kost geld en een maand, maar maakt een motor betrouwbaarder. Of je neemt het risico en leert in de lucht.</p>` +
    ids.map((id) => { const c = testCost(id, prog.heritage), r = reliability(id, prog.heritage); return `<div class="row"><div class="nm">${ENGINES[id].name}<small>nu ${pct(r)} betrouwbaar</small></div><button data-test="${id}" ${prog.budget >= c ? '' : 'disabled'}>Test · ${c} Mio</button></div>`; }).join('');
  $('#r-tests').onclick = (e) => { const b = e.target.closest('[data-test]'); if (!b) return; if (P.runTest(prog, b.dataset.test)) { P.save(prog); toast(`Testcampagne ${ENGINES[b.dataset.test].name}: ${pct(reliability(b.dataset.test, prog.heritage))} betrouwbaar`); renderTests(rep); } };
}
function drawPlot(sm) {
  const c = $('#r-plot'), g = c.getContext('2d'), W = c.width, H = c.height; if (!sm.length) return;
  const tMax = sm.at(-1)[0] || 1, aMax = Math.max(...sm.map((x) => x[1]), 1000), vMax = Math.max(...sm.map((x) => x[2]), 100);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, H * i / 4); g.lineTo(W, H * i / 4); g.stroke(); }
  for (const [k, col, mx] of [[1, '#e8a83a', aMax], [2, '#7aa7e0', vMax]]) {
    g.strokeStyle = col; g.lineWidth = 4; g.beginPath();
    sm.forEach((x, i) => { const X = x[0] / tMax * (W - 20) + 10, Yv = H - 14 - x[k] / mx * (H - 40); i ? g.lineTo(X, Yv) : g.moveTo(X, Yv); }); g.stroke();
  }
  g.fillStyle = '#d8cfba'; g.font = '26px sans-serif'; g.fillText(`${fmt(aMax / 1000)} km`, 14, 34); g.fillStyle = '#7aa7e0'; g.fillText(`${fmt(vMax)} m/s`, W - 170, 34);
}

// ================= LUS =================
let last = performance.now(), saveT = 0, finished = false;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (screen === 'flight' && sim) {
    sim.warp = autoWarp();
    if (!sim.s.outcome) sim.advance(dt * sim.warp);
    if (sim.s.outcome && !finished) { finished = true; finishFlight(); }
    if (now - lastHud > 100) { lastHud = now; renderHud(); }
    saveT += dt; if (saveT > 5) { saveT = 0; persist(); }
  }
  if (sim) world.update(sim, dt, screen === 'flight' ? 'flight' : 'hangar');
  world.render();
  requestAnimationFrame(frame);
}

// Start: hervat een lopende vlucht, anders de hangar
if (prog.flight) {
  sim = new FlightSim(prog.flight.design, P.missionById(prog.flight.mission), prog.heritage, Math.random, prog.flight);
  startFlight(); addMsg('Vlucht hervat', 'good');
} else enterHangar();
const _enterHangar = enterHangar;
window.__lr = { prog, world, get sim() { return sim; }, launch, act: (a) => { const b = document.createElement('button'); b.dataset.a = a; $('#f-acts').append(b); b.click(); }, enterHangar: _enterHangar };
// zodra een nieuwe vlucht start: 'finished' resetten
const _start = startFlight; void _start;
new MutationObserver(() => { if (screen === 'flight') finished = !!sim?.s.outcome; }).observe($('#flight'), { attributes: true, attributeFilter: ['class'] });
requestAnimationFrame(frame);
