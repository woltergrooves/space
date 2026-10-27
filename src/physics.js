// Vluchtsimulatie in het baanvlak (2D, inertiaal, meters). Geen Three.js: testbaar in Node.
// Zonnestelsel op ~1:3 schaal: aarde-straal 2124 km, oppervlaktezwaartekracht 9,81 m/s².
import { ENGINES, TANK, CAPSULE, SM, SAT, reliability } from './data.js';

export const R = 2124000, G0 = 9.81, MU = G0 * R * R;
export const HS = 0.0021 * R;            // schaalhoogte atmosfeer (gelijk aan de shader)
export const RHO0 = 1.225, ATM_TOP = 70000, SPACE = 50000, SAFE_PE = 60000, TARGET_APO = 75000;
export const PAD_ANGLE = Math.PI / 2;     // lanceerbasis bovenaan de cirkel
export const rho = (h) => (h <= 0 ? RHO0 : h >= ATM_TOP ? 0 : RHO0 * Math.exp(-h / HS));
const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// --- Ontwerp -> trappen (onder naar boven) ----------------------------------------
export function makeStages(design, withSat) {
  const st = design.stages.map((s) => {
    const e = ENGINES[s.engine];
    return { kind: 'booster', engine: s.engine, tanks: s.tanks, dry: e.mass + s.tanks * TANK.dry, prop: s.tanks * TANK.prop, propMax: s.tanks * TANK.prop };
  });
  st.push({ kind: 'sm', engine: 'oms', dry: SM.dry + (withSat ? SAT.mass : 0), prop: SM.prop, propMax: SM.prop });
  st.push({ kind: 'capsule', engine: null, dry: CAPSULE.dry, prop: 0, propMax: 0 });
  return st;
}

// Analyse voor de bouwer: Δv en TWR per trap
export function analyze(design, withSat) {
  const st = makeStages(design, withSat);
  const out = []; let total = 0;
  for (let i = 0; i < st.length - 1; i++) {
    const above = st.slice(i + 1).reduce((m, s) => m + s.dry + s.prop, 0);
    const m0 = above + st[i].dry + st[i].prop, m1 = m0 - st[i].prop, e = ENGINES[st[i].engine];
    const isp = i === 0 ? (e.ispSl * 0.4 + e.ispVac * 0.6) : e.ispVac;
    const dv = isp * G0 * Math.log(m0 / m1);
    const fsl = e.fvac * e.ispSl / e.ispVac;
    out.push({ kind: st[i].kind, engine: st[i].engine, dv, twr: (i === 0 ? fsl : e.fvac) / (m0 * G0), m0, burn: st[i].prop / (e.fvac / (e.ispVac * G0)) });
    total += dv;
  }
  const mass = st.reduce((m, s) => m + s.dry + s.prop, 0);
  return { stages: out, total, mass, boostDv: out.filter((s) => s.kind === 'booster').reduce((a, s) => a + s.dv, 0) };
}

// --- Baanelementen -----------------------------------------------------------------
export function elements(p, v) {
  const r = Math.hypot(p[0], p[1]), v2 = v[0] * v[0] + v[1] * v[1];
  const eps = v2 / 2 - MU / r, h = p[0] * v[1] - p[1] * v[0], rv = p[0] * v[0] + p[1] * v[1];
  const ex = ((v2 - MU / r) * p[0] - rv * v[0]) / MU, ey = ((v2 - MU / r) * p[1] - rv * v[1]) / MU;
  const e = Math.hypot(ex, ey);
  if (eps >= 0) return { e, apo: Infinity, pe: h * h / MU / (1 + e) - R, tApo: Infinity, period: Infinity, a: Infinity };
  const a = -MU / (2 * eps), n = Math.sqrt(MU / (a * a * a));
  const nu = Math.atan2(ex * p[1] - ey * p[0], ex * p[0] + ey * p[1]) * Math.sign(h || 1);
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
  const M = E - e * Math.sin(E), period = 2 * Math.PI / n;
  let tApo = (Math.PI - M) / n; if (tApo < 0) tApo += period;
  return { e, a, apo: a * (1 + e) - R, pe: a * (1 - e) - R, tApo, period };
}

// --- Simulatie ------------------------------------------------------------------------
export class FlightSim {
  constructor(design, mission, heritage, rng = Math.random, restore = null) {
    this.rng = rng; this.heritage = heritage;
    this.s = restore || {
      design, mission: mission.id, withSat: !!mission.sat,
      p: [Math.cos(PAD_ANGLE) * R, Math.sin(PAD_ANGLE) * R], v: [0, 0], alpha: PAD_ANGLE,
      t: 0, met: 0, stages: makeStages(design, !!mission.sat), si: 0, throttle: 0, assist: true,
      mode: 'ascent', phase: 'pad', eng: {}, chute: 0, chuteState: 'stowed', shield: 100, hull: 0, flux: 0, maxG: 0, g: 0,
      objectives: { orbit: false, photo: false, eva: false, sat: false }, satReleased: false, eva: false,
      events: [], samples: [], nextSample: 0, outcome: null, steer: 0, burning: false,
    };
  }
  get stage() { return this.s.stages[this.s.si]; }
  get alt() { return Math.hypot(this.s.p[0], this.s.p[1]) - R; }
  get phi() { return Math.atan2(this.s.p[1], this.s.p[0]); }
  get speed() { return Math.hypot(this.s.v[0], this.s.v[1]); }
  get vVert() { const s = this.s, r = Math.hypot(s.p[0], s.p[1]); return (s.p[0] * s.v[0] + s.p[1] * s.v[1]) / r; }
  get orbit() { return elements(this.s.p, this.s.v); }
  get mass() { const s = this.s; return s.stages.slice(s.si).reduce((m, x) => m + x.dry + x.prop, 0) - (s.satReleased ? SAT.mass : 0); }
  get capsuleOnly() { return this.s.stages[this.s.si].kind === 'capsule'; }
  get hasSM() { return this.s.stages[this.s.si].kind === 'sm'; }
  event(text, kind = 'info') { this.s.events.push({ t: this.s.met, text, kind }); this.onEvent?.(text, kind); }

  engState(i) {
    const s = this.s; let e = s.eng[i];
    if (!e) {
      const st = s.stages[i], rel = reliability(st.engine, this.heritage);
      const burn = st.propMax / (ENGINES[st.engine].fvac / (ENGINES[st.engine].ispVac * G0));
      const fails = this.rng() > rel;
      e = s.eng[i] = { burnT: 0, failAt: fails ? burn * (0.15 + 0.6 * this.rng()) : Infinity, warned: false, failed: false, limited: false, saved: false, rel };
    }
    return e;
  }
  thrustAvailable() {
    const s = this.s, st = this.stage; if (!st.engine || st.prop <= 0) return 0;
    const e = ENGINES[st.engine], es = s.eng[s.si];
    if (es?.failed) return 0;
    const r = rho(this.alt) / RHO0;
    return e.fvac * (e.ispVac - (e.ispVac - e.ispSl) * r) / e.ispVac;
  }

  stageSep() {
    const s = this.s; if (s.si >= s.stages.length - 1) return null;
    if (s.phase === 'pad') return null;
    const dropped = s.stages[s.si]; s.si++;
    this.onStage?.(s.si - 1);
    this.event(dropped.kind === 'sm' ? 'Servicemodule afgestoten' : `Trap ${s.si} afgestoten`);
    if (this.capsuleOnly) { s.mode = s.assist ? 'reentry' : 'manual'; s.throttle = 0; }
    return { kind: dropped.kind, index: s.si - 1 };
  }
  setThrottle(x, byPlayer = true) {
    const s = this.s; s.throttle = Math.max(0, Math.min(1, x));
    if (byPlayer && (s.mode === 'circ' || s.mode === 'deorbit')) { s.mode = s.assist ? 'coast' : 'manual'; this.event('Autopiloot onderbroken'); }
  }
  setAssist(on) { const s = this.s; s.assist = on; s.mode = on ? (s.phase === 'pad' || (this.alt < SPACE && this.vVert > 0 && !s.objectives.orbit) ? 'ascent' : this.capsuleOnly ? 'reentry' : 'coast') : 'manual'; }
  canDeployChute() { const s = this.s; return s.chuteState === 'stowed' && this.capsuleOnly && this.alt < 12000 && s.phase === 'flying'; }
  deployChute() {
    const s = this.s; if (!this.canDeployChute()) return;
    if (this.speed > 320) { s.chuteState = 'torn'; this.event(`Parachute gescheurd: geopend bij ${Math.round(this.speed)} m/s (max ≈ 300)`, 'bad'); return; }
    s.chuteState = 'open'; this.event('Parachute open');
  }
  releaseSat() {
    const s = this.s; if (!s.withSat || s.satReleased || !this.hasSM) return false;
    s.satReleased = true; const o = this.orbit;
    s.objectives.sat = o.pe >= SAFE_PE;
    this.event(s.objectives.sat ? 'Satelliet Merel uitgezet in een stabiele baan' : `Satelliet uitgezet, maar de baan is instabiel (laagste punt ${Math.round(o.pe / 1000)} km)`, s.objectives.sat ? 'good' : 'bad');
    return true;
  }
  canEva() { const s = this.s; return !s.eva && s.phase === 'flying' && s.throttle === 0 && (this.hasSM || this.capsuleOnly) && this.orbit.pe > SPACE; }

  // Hoekdoel van de assistent (inertiaal), of null = vasthouden
  targetAlpha() {
    const s = this.s, phi = this.phi, v = s.v;
    const pro = Math.atan2(v[1], v[0]), retro = pro + Math.PI;
    switch (s.mode) {
      case 'ascent': {
        if (this.alt < 200) return phi;
        let psi = Math.min(85 * DEG, 90 * DEG * Math.pow(Math.min(1, this.alt / 46000), 0.55));
        const F = this.thrustAvailable(), m = this.mass;
        if (this.alt > 18000 && F > 0) { // buiten de dichte lucht: houd genoeg verticale snelheid
          const r = R + this.alt, vh = Math.sqrt(Math.max(this.speed ** 2 - this.vVert ** 2, 0));
          const geff = MU / (r * r) - vh * vh / r;
          const vdes = Math.max(0, geff * 40 * Math.min(1, (TARGET_APO - this.alt) / 15000));
          const cosPsi = (geff + 0.08 * (vdes - this.vVert)) / (F / m);
          psi = Math.max(25 * DEG, Math.acos(Math.max(0, Math.min(1, cosPsi))));
        }
        return phi + psi; // kantelen richting oost (baanrichting tegen de klok in)
      }
      case 'coast': return this.speed > 50 ? pro : null;
      case 'circ': return phi + 90 * DEG; // horizontaal in baanrichting
      case 'deorbit': case 'reentry': return this.speed > 5 ? retro : null;
      default: return null;
    }
  }

  advance(dtTotal) {
    let left = dtTotal;
    while (left > 1e-9) {
      const h = this.alt < ATM_TOP || this.s.throttle > 0 ? 0.02 : 0.1;
      const dt = Math.min(h, left); this.step(dt); left -= dt;
      if (this.s.outcome) break;
    }
  }

  step(dt) {
    const s = this.s; if (s.outcome) return;
    const r = Math.hypot(s.p[0], s.p[1]), alt = r - R, up = [s.p[0] / r, s.p[1] / r];
    if (s.phase !== 'pad') { s.t += dt; s.met += dt; }

    // Houding
    const tgt = s.assist ? this.targetAlpha() : null;
    if (tgt !== null) { const d = wrap(tgt - s.alpha); s.alpha += Math.sign(d) * Math.min(Math.abs(d), 14 * DEG * dt); }
    else if (!s.assist || s.mode === 'manual') s.alpha += s.steer * 20 * DEG * dt;

    // Autopiloot-logica
    const o = (s.phase === 'flying' && alt > 30000) ? elements(s.p, s.v) : null;
    if (s.assist && s.mode === 'ascent' && s.phase === 'flying') {
      if (o && o.apo >= TARGET_APO) { s.throttle = 0; s.mode = 'coast'; this.event('Doelhoogte bereikt: motor uit, uitrollen naar het hoogste punt', 'good'); }
    }
    if (s.mode === 'circ' && o) {
      const thr = this.thrustAvailable() || 1;
      const need = Math.sqrt(MU / (R + o.apo)) - Math.sqrt(MU * (2 / (R + o.apo) - 1 / o.a));
      const burnT = need * this.mass / thr;
      if (!s.burning && o.tApo < burnT / 2 + 1 && o.tApo < o.period / 2) { s.burning = true; this.event('Circulariseren: motor aan'); }
      if (s.burning) s.throttle = 1;
      if (s.burning && (o.pe > o.apo - 3000 || o.pe > TARGET_APO + 20000 || this.vVert < -40)) {
        s.burning = false; s.throttle = 0; s.mode = 'coast';
        this.event(o.pe >= SAFE_PE ? 'Circularisatie voltooid' : 'Circularisatie gestopt: baan nog niet stabiel', o.pe >= SAFE_PE ? 'good' : 'warn');
      }
    }
    if (s.mode === 'deorbit') {
      const aligned = Math.abs(wrap(this.targetAlpha() - s.alpha)) < 5 * DEG;
      s.throttle = aligned ? 1 : 0;
      if (o && o.pe < 25000) { s.throttle = 0; s.mode = 'reentry'; this.event('Terugkeerbaan bereikt. Stoot de servicemodule af vóór 50 km!', 'warn'); }
      if (!o && alt < 30000) { s.throttle = 0; s.mode = 'reentry'; }
    }
    // Assistent stoot lege boostertrappen automatisch af
    if (s.assist && s.phase === 'flying' && this.stage.kind === 'booster' && this.stage.prop <= 0 && s.si < s.stages.length - 2) {
      const wasThrottle = s.throttle; this.stageSep(); s.throttle = wasThrottle;
    }

    // Assistent: veilige terugkeer als we vallen zonder baan (abortus of vergeten afstoten)
    if (s.assist && s.phase === 'flying' && !this.capsuleOnly && s.met > 20 && alt < 45000 && this.vVert < -60) {
      this.event(s.objectives.orbit ? 'Assistent stoot de servicemodule af voor de terugkeer' : 'Geen baan haalbaar: assistent scheidt de capsule voor een veilige terugkeer', 'warn');
      while (!this.capsuleOnly) this.stageSep();
    }

    // Stuwkracht
    const st = this.stage; let F = 0;
    if (st.engine && st.prop > 0 && s.throttle > 0) {
      const es = this.engState(s.si), e = ENGINES[st.engine];
      if (!es.failed) {
        const thr = es.limited ? Math.min(s.throttle, 0.7) : s.throttle;
        es.burnT += dt * thr;
        if (!es.warned && es.burnT > es.failAt - 3.5) { es.warned = true; es.warnUntil = s.met + 3.5; this.event(`Trilling in ${e.name}! Gas onder 70% om de verbranding te stabiliseren`, 'warn'); }
        if (es.warned && !es.saved && !es.failed && s.met >= es.warnUntil) {
          if (s.throttle <= 0.71) { es.saved = true; es.limited = true; es.failAt = Infinity; this.event(`${e.name} gestabiliseerd, vermogen begrensd op 70%`, 'good'); }
          else { es.failed = true; this.event(`${e.name} uitgevallen: verbrandingsinstabiliteit`, 'bad'); }
        }
        if (es.warned && !es.saved && s.throttle <= 0.71 && s.met < es.warnUntil) { es.saved = true; es.limited = true; es.failAt = Infinity; this.event(`${e.name} gestabiliseerd, vermogen begrensd op 70%`, 'good'); }
        if (!es.failed) {
          const mdot = e.fvac / (e.ispVac * G0) * thr;
          const use = Math.min(st.prop, mdot * dt); st.prop -= use;
          F = this.thrustAvailable() * thr * (use / Math.max(mdot * dt, 1e-9));
          if (st.prop <= 0) this.event(`${e.name}: brandstof op`);
        }
      }
    }
    s.burning = s.burning && F > 0 || (s.mode === 'circ' && s.burning);
    const m = this.mass;
    const dir = [Math.cos(s.alpha), Math.sin(s.alpha)];

    // Lancering
    if (s.phase === 'pad') {
      if (F > m * G0 * 1.01) { s.phase = 'flying'; this.event('Lancering!', 'good'); }
      else return;
    }

    // Luchtweerstand en hitte
    const rh = rho(alt), sp = this.speed;
    let cda = this.capsuleOnly ? 15 : (this.hasSM ? 5 : 1.6);
    if (s.chuteState === 'open') { s.chute = Math.min(1, s.chute + dt / 4); cda += 380 * s.chute * s.chute; }
    const drag = 0.5 * rh * sp * sp * cda;
    s.flux = sp > 1200 ? 2.2e-5 * Math.sqrt(rh) * Math.pow(sp, 3) / 1000 : 0; // ~kW/m², vereenvoudigd
    if (s.flux > 0) {
      if (this.capsuleOnly) {
        const facing = Math.cos(wrap(s.alpha - Math.atan2(-s.v[1], -s.v[0])));
        const k = facing > 0.8 ? 1 : 6; // zijkant/neus vooruit = ongeschermd
        s.shield -= s.flux * k * dt * 0.011;
        if (s.shield < 0) this.lose('Capsule verbrand bij terugkeer: hitteschild doorgebrand');
      } else if (s.flux > 60) {
        s.hull += s.flux * dt * 0.004;
        if (s.hull > 100) this.lose(this.hasSM ? 'Servicemodule niet afgestoten: hitteschild bedekt, capsule verbrand' : 'Raket uiteengevallen door hitte en luchtdruk');
      }
    }
    if (s.chuteState === 'open' && sp > 340) { s.chuteState = 'torn'; this.event('Parachute gescheurd door te hoge snelheid', 'bad'); }

    // Integratie (semi-impliciete Euler)
    const g = MU / (r * r);
    let ax = -g * up[0], ay = -g * up[1];
    const at = F / m; ax += dir[0] * at; ay += dir[1] * at;
    if (sp > 0.01) { ax -= s.v[0] / sp * drag / m; ay -= s.v[1] / sp * drag / m; }
    s.g = Math.hypot(ax + g * up[0], ay + g * up[1]) / G0; if (s.phase === 'flying' && s.met > 1) s.maxG = Math.max(s.maxG, s.g);
    s.v[0] += ax * dt; s.v[1] += ay * dt;
    s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt;

    // Assistent: automatische parachute
    if (s.assist && this.canDeployChute() && alt < 6000 && sp < 290 && this.vVert < 0) this.deployChute();

    // Telemetrie
    if (s.met >= s.nextSample) {
      s.samples.push([Math.round(s.met), Math.round(alt), Math.round(sp)]);
      s.nextSample = s.met + (alt > ATM_TOP ? 20 : 2);
    }
    if (o && !s.objectives.orbit && o.pe >= SAFE_PE) { s.objectives.orbit = true; this.event('Stabiele baan bereikt!', 'good'); }

    // Grond / zee
    const r2 = Math.hypot(s.p[0], s.p[1]);
    if (r2 <= R) {
      const vs = this.speed;
      s.p[0] *= R / r2; s.p[1] *= R / r2;
      if (this.capsuleOnly && vs < 14) { s.phase = 'landed'; s.v = [0, 0]; this.event(`Landing in zee met ${vs.toFixed(1)} m/s`, 'good'); this.finish(true); }
      else this.lose(`Inslag met ${Math.round(vs)} m/s${this.capsuleOnly ? '' : ' (capsule niet afgescheiden)'}`);
    }
  }
  lose(reason) { const s = this.s; if (s.outcome) return; s.phase = 'lost'; this.event(reason, 'bad'); this.finish(false); }
  finish(recovered) {
    const s = this.s, ob = s.objectives;
    const done = { orbit: ob.orbit, eva: ob.orbit && ob.eva && ob.photo, sat: ob.sat, test: true }[s.mission];
    s.outcome = { recovered, success: recovered && done, objective: done };
  }
}
