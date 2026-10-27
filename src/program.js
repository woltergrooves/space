// Programmastand: budget, datum, vlieg-erfgoed, kroniek. Opslag in localStorage.
import { ENGINES, TANK, CAPSULE, SM, SAT, MISSIONS, DEFAULT_DESIGN, reliability, testCost, dateName } from './data.js';

const KEY = 'longrace.save.v1';
export function newProgram() {
  return { budget: 160, rep: 0, month: 2, heritage: {}, done: [], chronicle: [], design: structuredClone(DEFAULT_DESIGN), mission: 'orbit', flight: null, flightNo: 0, quality: null };
}
export function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.heritage) return s; } catch { /* leeg */ }
  return newProgram();
}
export function save(prog) { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch { /* vol of privé */ } }

export function designCost(design, mission) {
  let c = CAPSULE.cost + SM.cost + (mission?.sat ? SAT.cost : 0);
  for (const s of design.stages) c += ENGINES[s.engine].cost + s.tanks * TANK.cost;
  return c;
}
export const missionById = (id) => MISSIONS.find((m) => m.id === id);
export const missionAvailable = (prog, m) => !m.req || prog.done.includes(m.req);

// Verwerk een afgeronde vlucht: geld, erfgoed, kroniek. Geeft rapportdata terug.
export function applyFlight(prog, sim, photo) {
  const s = sim.s, mission = missionById(s.mission), out = s.outcome || { recovered: false, success: false, objective: false };
  const rep = { mission, outcome: out, events: s.events, samples: s.samples, photo, maxG: s.maxG, shield: s.shield, money: [], heritage: [], date: dateName(prog.month), name: s.design.name };
  // erfgoed per gebruikte motor
  const used = new Map();
  s.stages.forEach((st, i) => {
    if (!st.engine) return;
    const es = s.eng[i]; if (!es) return;
    const u = used.get(st.engine) || { flew: false, data: 0 };
    u.flew = true; if (es.warned) u.data += 1;
    used.set(st.engine, u);
  });
  for (const [id, u] of used) {
    const before = reliability(id, prog.heritage);
    const h = prog.heritage[id] ||= { flights: 0, tests: 0, data: 0 };
    h.flights += 1; h.data += u.data;
    rep.heritage.push({ id, name: ENGINES[id].name, before, after: reliability(id, prog.heritage), data: u.data });
  }
  // geld
  if (out.objective && !prog.done.includes(mission.id) && mission.reward) {
    rep.money.push([`Missiedoel: ${mission.name}`, mission.reward]); prog.rep += mission.rep;
  } else if (out.objective && mission.reward) {
    rep.money.push([`Herhaling ${mission.name} (halve beloning)`, Math.round(mission.reward / 2)]);
  }
  if (out.recovered) rep.money.push(['Capsule geborgen en hergebruikt', CAPSULE.refund]);
  rep.money.push(['Basissubsidie per kwartaal', 15]);
  for (const [, v] of rep.money) prog.budget += v;
  if (out.objective && !prog.done.includes(mission.id)) prog.done.push(mission.id);
  if (!out.recovered) prog.rep = Math.max(0, prog.rep - 10);
  // kroniek
  prog.flightNo += 1;
  prog.chronicle.push({ no: prog.flightNo, date: dateName(prog.month), name: s.design.name, mission: mission.name, success: out.success, recovered: out.recovered, photo: photo || null, sat: s.objectives.sat });
  if (prog.chronicle.length > 30) prog.chronicle.shift();
  prog.month += 3; prog.flight = null;
  return rep;
}

export function runTest(prog, id) {
  const c = testCost(id, prog.heritage); if (prog.budget < c) return false;
  prog.budget -= c; (prog.heritage[id] ||= { flights: 0, tests: 0, data: 0 }).tests += 1; prog.month += 1;
  return true;
}
