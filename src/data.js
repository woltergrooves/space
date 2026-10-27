// Speldata: onderdelen en missies. Alle namen zijn fictief.
// Massa in kg, stuwkracht in N, kosten in Mio (programmabudget).

export const ENGINES = {
  hector:   { id: 'hector', name: 'Hector', role: 'Zware eerste trap', fvac: 820e3, ispSl: 255, ispVac: 285, mass: 3400, cost: 18, r0: 0.86, bell: [0.42, 0.95, 1.5] },
  vesta:    { id: 'vesta', name: 'Vesta', role: 'Middelzware motor', fvac: 230e3, ispSl: 262, ispVac: 296, mass: 1300, cost: 9, r0: 0.90, bell: [0.3, 0.7, 1.15] },
  ruisseau: { id: 'ruisseau', name: 'Ruisseau', role: 'Bovenste trap (vacuüm)', fvac: 165e3, ispSl: 150, ispVac: 330, mass: 750, cost: 10, r0: 0.88, bell: [0.2, 0.85, 1.4] },
  oms:      { id: 'oms', name: 'Kievit-OMS', role: 'Manoeuvreermotor servicemodule', fvac: 18e3, ispSl: 200, ispVac: 305, mass: 0, cost: 0, r0: 0.98 },
};
export const BOOSTER_ENGINES = ['hector', 'vesta', 'ruisseau'];

export const TANK = { name: 'Tank T-4', prop: 4000, dry: 450, h: 2.4, r: 0.95, cost: 2 };
export const CAPSULE = { name: 'Kievit-capsule', dry: 2200, cost: 20, refund: 8 };
export const SM = { name: 'Servicemodule', dry: 800, prop: 1000, cost: 8 };
export const SAT = { name: 'Satelliet Merel', mass: 300, cost: 6 };
export const MAX_TANKS = 8, MAX_STAGES = 3;

export const DEFAULT_DESIGN = { name: 'Lansier I', stages: [{ engine: 'hector', tanks: 6 }, { engine: 'ruisseau', tanks: 3 }] };

export const MISSIONS = [
  { id: 'orbit', name: 'Eerste baan', reward: 60, rep: 10,
    desc: 'Bereik een stabiele baan (laagste punt ≥ 60 km) en keer veilig terug.' },
  { id: 'eva', name: 'Ruimtewandeling', reward: 80, rep: 15, req: 'orbit',
    desc: 'Stap in een stabiele baan uit de capsule, maak een foto en keer veilig terug.' },
  { id: 'sat', name: 'Satelliet Merel', reward: 70, rep: 10, req: 'orbit', sat: true,
    desc: 'Zet satelliet Merel uit vanuit het vak in de servicemodule en keer veilig terug.' },
  { id: 'test', name: 'Testvlucht', reward: 0, rep: 0,
    desc: 'Geen doel. Vlieg om ervaring met je onderdelen op te doen (vlieg-erfgoed).' },
];

export const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
export const dateName = (m) => `${MONTHS[m % 12]} ${1967 + Math.floor(m / 12)}`;

// Betrouwbaarheid groeit met vluchten (erfgoed) en grondtests.
export function reliability(id, heritage) {
  const e = ENGINES[id], h = heritage[id] || { flights: 0, tests: 0, data: 0 };
  return 1 - (1 - e.r0) * Math.pow(0.72, h.flights + h.data * 0.5) * Math.pow(0.8, h.tests);
}
export const testCost = (id, heritage) => 4 + 2 * ((heritage[id]?.tests) || 0);
