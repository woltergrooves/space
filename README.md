# Long Race (werktitel)

Ruimtevaartgame in een alternatieve geschiedenis, gemaakt voor iPhone/iPad in de browser.

- **Spelen:** https://long-race.vercel.app (zet het via Safari → Deel → "Zet op beginscherm" op je beginscherm)
- **Roadmap & beslissingen:** [docs/ROADMAP.md](docs/ROADMAP.md)

## Lokaal draaien
Er is geen bouwstap. Start een statische server in deze map, bijvoorbeeld `python3 -m http.server`, en open `index.html`.

## Structuur
- `src/sky.js`: hemel, aarde en atmosfeer (shader) + sterren
- `src/craft.js`: capsule
- `src/astronaut.js`: astronaut + gedrag
- `src/controls.js`: touchcamera
- `src/textures.js`: procedurele texturen
- `vendor/`: Three.js r170 (MIT)
