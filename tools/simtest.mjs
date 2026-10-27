// Headless test van de volledige spelcyclus: lanceren -> baan -> missie -> terugkeer -> landing.
import { FlightSim, analyze, SAFE_PE } from '../src/physics.js';
import { DEFAULT_DESIGN, MISSIONS } from '../src/data.js';
const mission = MISSIONS.find(m => m.id === (process.argv[2] || 'sat'));
const seed = Number(process.argv[3] || 1); const rng = Math.random;
console.log('analyse', JSON.stringify(analyze(DEFAULT_DESIGN, !!mission.sat).stages.map(s => [s.engine, Math.round(s.dv), s.twr.toFixed(2)])), Math.round(analyze(DEFAULT_DESIGN, true).total));
const sim = new FlightSim(DEFAULT_DESIGN, mission, {}, rng);
sim.onEvent = (t, k) => console.log(`T+${sim.s.met.toFixed(0).padStart(5)} h=${(sim.alt/1000).toFixed(1).padStart(6)}km v=${sim.speed.toFixed(0).padStart(5)} [${k}] ${t}`);
sim.setThrottle(1);
let phase = 'up', t = 0;
while (!sim.s.outcome && t < 20000) {
  // speler reageert op trillingswaarschuwing
  const es = sim.s.eng[sim.s.si]; if (es && es.warned && !es.saved && !es.failed && sim.s.throttle > 0.7) sim.setThrottle(0.65, false);
  if (phase === 'up' && sim.s.mode === 'coast') { sim.s.mode = 'circ'; phase = 'circ'; }
  if (phase === 'circ' && sim.s.mode === 'coast' && sim.s.objectives.orbit) {
    if (mission.sat) sim.releaseSat();
    if (mission.id === 'eva') { sim.s.objectives.eva = sim.s.objectives.photo = true; }
    // dump lege boostertrap vóór terugkeer
    while (sim.stage.kind === 'booster') sim.stageSep();
    sim.advance(600); sim.s.mode = 'deorbit'; phase = 'deorbit';
  }
  if (phase === 'deorbit' && sim.s.mode === 'reentry' && sim.hasSM && sim.alt < 60000) { sim.stageSep(); phase = 'reentry'; }
  if (phase === 'circ' && sim.s.mode === 'coast' && !sim.s.objectives.orbit) { console.log('GEEN BAAN', sim.orbit); break; }
  sim.advance(sim.alt > 70000 && sim.s.throttle === 0 && !sim.s.burning ? 1 : 0.1); t += 0.1;
}
const o = sim.orbit;
console.log('uitkomst', JSON.stringify(sim.s.outcome), 'schild', sim.s.shield.toFixed(0), 'maxG', sim.s.maxG.toFixed(1), 'SM-prop', sim.s.stages.find(s=>s.kind==='sm').prop.toFixed(0), 'samples', sim.s.samples.length);
