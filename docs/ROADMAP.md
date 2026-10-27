# Long Race: roadmap

*Werktitel. Alternatieve ruimtevaartgeschiedenis vanaf 1966. Browsergame voor iPhone/iPad.*

## Werkafspraken
- **Nieuwe ideeën eerst ter goedkeuring.** Claude stelt voor en bouwt pas als het idee is goedgekeurd.
- **Zuinig met de limiet.** We werken in kleine, speelbare stappen. Claude doet zelf een korte visuele check met screenshots; jij beoordeelt het gevoel op je iPhone.
- **Geen betaalde diensten zonder overleg.** Hosting gebeurt gratis via Vercel (Hobby), automatisch bij elke push naar main.
- **Elke mijlpaal staat in versiebeheer** en de laatste werkende versie blijft online.

## Genomen beslissingen (aanbevolen keuzes, op 27-10-2026 met "ja" bevestigd)
| Vraag | Keuze |
|---|---|
| Wie speel je? | Een **Europees programma** als underdog tussen de VS en de USSR |
| Schaal zonnestelsel | **Verkleind, ongeveer 1:3**: kortere sessies, het blijft geloofwaardig |
| Historische personen | Alleen als **achtergrond**, met fictieve hoofdpersonen |
| Rondlopen | **Derde persoon** |
| Volgorde | **Eerst M0** (sfeertest) los, daarna M1 |
| Startpunt tijdlijn | Januari 1966: Koroljov overleeft zijn operatie, het Sovjetprogramma blijft sterk |
| Kernsystemen | De Kroniek (geschiedenis als plek) · Vlieg-erfgoed · Publieke beloftes |
| Extra ideeën | Zichtbare rivalen, radiodekking als infrastructuur, lanceervensters bepalen de tijd, persoonlijke spullen |

> Zit een van deze keuzes je niet lekker? Zeg het gerust. Tot en met M1 zijn ze nog goedkoop om te veranderen.

## Techniek
- Gewone JavaScript-modules + **Three.js r170** (gevendord in `vendor/`), **zonder bouwstap**. De repo is direct speelbaar als website.
  *Afwijking van het voorstel:* TypeScript vervalt. In de werkomgeving is npm geblokkeerd, en zonder bouwstap is het project eenvoudiger over te dragen. Typecontrole kan later via JSDoc.
- Twee render-lagen: (1) hemel, aarde en atmosfeer in aardstralen, (2) vaartuig en astronaut in meters. Zo zijn er geen precisieproblemen bij planeetschaal.
- Opslaan: `localStorage` bij elke belangrijke gebeurtenis, en wanneer Safari de app naar de achtergrond stuurt (`visibilitychange`/`pagehide`).

## Mijlpalen

### M0: Sfeertest ✅ gebouwd · ⏳ wacht op jouw iPhone-test
Een capsule en een astronaut in een lage baan (400 km), met een volledige omloop inclusief dag, zonsondergang en nacht.
- Procedurele aarde: continenten, oceaan met zonneglinstering, wolken, poolkappen, stadslichten en onweer aan de nachtzijde.
- Atmosfeer met verstrooiing: een blauwe rand, rode overgangen en de schaduw van de aarde.
- Sterrenveld (kleur en helderheid gevarieerd, dichter langs de Melkweg), een Melkwegband met stofbanen en drie subtiele nevels. Sterren en nevels worden zichtbaarder als het beeld donker is (oogadaptatie).
- Capsule "Kievit 3" met crèmekleurige panelen, schroeisporen, goudfolie, een warm venster, handgrepen, RCS-blokken en een antenne.
- Astronaut met snor, comm-cap en expressieve wenkbrauwen. Hij zweeft aan een handgreep, kijkt naar je als je dichtbij komt, wijst naar de aarde en zwaait.
- Touchbediening: slepen, knijpen, dubbeltik voor een ander standpunt, tijdversnelling ×1/×10/×60, drie kwaliteitsniveaus (met automatisch terugschakelen) en een "Kijk"-modus zonder knoppen.
- **Placeholders, eerlijk benoemd:** de aarde is procedureel en heeft geen echte continenten. De personages bestaan uit simpele vormen. Er is geen geluid en geen bloom-effect.

**Wat ik van jou nodig heb:** speel het op je iPhone en vertel me: haalt het een vloeiend aantal fps (rechtsboven)? Hoe voelt de sfeer? Wat werkt wel en wat niet?

### M1: Eerste volledige spelcyclus ✅ gebouwd · 🧪 headless getest door Claude · ⏳ wacht op jouw iPhone-test
Speelbaar: hangar (trappen, motoren, tanks, live Δv-balk en waarschuwingen) → lancering met duimgas en stuur-assistent → baan (circuleren met autopiloot en automatische tijdversnelling) → missie (ruimtewandeling met krantenfoto, satelliet Merel uitzetten, of testvlucht) → terugkeer (terugkeerbrand, servicemodule afstoten, hitteschild, parachute, landing in zee) → vluchtrapport (telemetriegrafiek, logboek, vlieg-erfgoed, budget) → grondtests om motoren te verbeteren. Daarbij: kroniek met foto's, en hervatten midden in een vlucht.
- Motorstoringen worden altijd 3,5 s vooraf gewaarschuwd (trilling). Tegenmaatregel: gas onder 70%. Een storing levert data op, wat de betrouwbaarheid sneller laat stijgen.
- Een abortus redt de bemanning: de assistent scheidt de capsule als er geen baan haalbaar is.
- Schaal: de aarde heeft een straal van 2124 km (1:3). Een stabiele baan begint bij een laagste punt van ≥ 60 km, de atmosfeer reikt tot 70 km.
- **Placeholders, eerlijk benoemd:** geen geluid. Er is geen rook of uitlaatpluim, alleen een vlam. Elke landing telt als landing in zee. Het platform staat op een "eiland". De astronaut is altijd dezelfde. Sommige teksten en de balans zijn nog ruw.

Oorspronkelijk plan M1:
Bouwen → lanceren → baan → missie → terugkeer → telemetrie → verbeteren.
1. **Hangar:** onderdelen kiezen in een schuifmenu onderaan, met een live balk voor het snelheidsbudget (Δv) en de stuwkracht-gewichtsverhouding (TWR).
2. **Lancering:** stuwkracht met je duim, de assistent stuurt de draaiing (*gravity turn*), trappen scheiden.
3. **Baan:** een vereenvoudigde baanweergave met apoapsis en periapsis, plus hulp bij het circulariseren.
4. **Missie:** een satelliet uitzetten óf een ruimtewandeling (hergebruikt M0).
5. **Terugkeer:** remmen, gloeiend hitteschild, parachute, landing in zee.
6. **Telemetrierapport + vlieg-erfgoed:** onderdelen worden betrouwbaarder doordat je ermee vliegt. Een motorstoring is uitlegbaar en te verhelpen.
7. Opslaan en hervatten midden in een vlucht.

### M2: Naar de maan
Transfer, landing, uitstappen in derde persoon met verende lage-zwaartekrachtanimatie, een vlag, en de eerste plek in de Kroniek die blijft bestaan.

### M3: Programmalaag
Publieke beloftes, astronautenloopbanen, de rivaal als zichtbare speler in de wereld, en tijdsprongen per lanceervenster.

### M4: Infrastructuur
Bases, rovers, relaissatellieten (radiodekking) en depots.

### Daarna
Mars, private partijen, buitenplaneten. Een interstellaire uitbreiding blijft speculatief.

## Status-legenda
✅ gebouwd · 🧪 getest (door wie) · 💡 voorgesteld · ⛔ nog niet mogelijk
