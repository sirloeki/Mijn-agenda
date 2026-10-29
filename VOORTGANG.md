# Voortgang – Mijn Agenda

Logboek van wat we gedaan hebben, welke keuzes we maakten en wat de volgende stap is.

## Stappenplan
1. [x] Plan en vragen
2. [x] GitHub-project opzetten (repository `Mijn-agenda` bestaat al)
3. [x] Eerste versie: weekweergave met voorbeeldafspraken
4. [x] Online zetten via GitHub Pages en testen op telefoon
5. [x] Installeerbaar maken als app met icoon (PWA)
6. [x] Koppeling met Google Calendar
   - [x] 6a. Google Cloud-project aanmaken (naam "Mijn agenda", project-ID `mijn-agenda-512509`, geen organisatie, GEEN betaalgegevens/free trial)
   - [x] 6b. Google Calendar API aanzetten
   - [x] 6c. Toestemmingsscherm instellen + jezelf als testgebruiker (External, status Testing laten staan)
   - [x] 6d. Client-ID (inlogsleutel voor de app) maken (type Web application, origin `https://sirloeki.github.io`)
   - [x] 6e. Inloggen en afspraken lezen in de app bouwen (inloggen op de telefoon werkt)
   - [x] 6f. Outlook-afspraken (.ics) importeren en categorieën regelen
     - [x] Ronde 1: overzichtspagina gebouwd (`importeren.html`), nog uitvoeren met het echte bestand
     - [x] Ronde 1 uitgevoerd: 8.747 afspraken (2014–2028), 135 nog actueel, 182 herhalend, 0 bijlagen.
           Bijna alles zonder categorie; alleen "Travelling" (166) komt echt voor.
     - [x] Keuzes ronde 2: vanaf 1 jan 2026; agenda "Werk (Outlook)" voor alles, "Reizen" voor Travelling
     - [x] Ronde 2 gebouwd (getest met nagebootste Google)
     - [x] Ronde 2 uitgevoerd: 1.000 naar "Werk (Outlook)", 19 naar "Reizen", 108 aangepaste keren; 0 mislukt.
           Let op: tijdzones "Unnamed Time Zone 1" en "Unnamed Time Zone 3" uit Outlook zijn als Amsterdam-tijd
           overgenomen; afspraken daarmee kunnen een paar uur verschoven zijn (nog controleren).
7. [~] Afspraken toevoegen, aanpassen en verwijderen (gebouwd en getest met nagebootste Google; nog testen op de telefoon)
8. [ ] Verfijnen met extra wensen

## Gedaan
- Outlook-agenda geëxporteerd als .ics en veilig bewaard in Google Drive (niet in GitHub, want privé).
- Het .ics-bestand is geïmporteerd in Google (stap 6f), vanaf 1 jan 2026.
- Eerste versie van de app gebouwd (stap 3):
  - `index.html`: de opbouw van de pagina
  - `style.css`: de opmaak (kleuren, licht/donker, telefoon/laptop)
  - `app.js`: de werking (weekweergave, knoppen, voorbeeldafspraken)
  - Kan nu: 1/5/7 dagen, vorige/volgende/Vandaag, weeknummer, hele-dag-strook,
    rode lijn voor het huidige tijdstip, overlappende afspraken naast elkaar,
    tik op een afspraak voor details, gekozen aantal dagen wordt onthouden.
  - Afspraken zijn nog nepvoorbeelden (categorieën Werk, Privé, Reizen).
- Online gezet (stap 4): project is openbaar gemaakt en GitHub Pages staat aan (branch `main`, map `/ (root)`).
  - Webadres: https://sirloeki.github.io/Mijn-agenda/
  - Werkt op de telefoon. Nog alleen bekijken; toevoegen/aanpassen komt in stap 7.
  - Let op: GitHub Pages toont wat er op `main` staat. Nieuwe versies moeten dus naar `main`.
- Installeerbaar gemaakt (stap 5):
  - `manifest.webmanifest`: naam, kleuren en iconen van de app
  - `sw.js` (service worker): maakt installeren mogelijk en laat de app ook zonder internet openen.
    Haalt altijd eerst de nieuwste versie op; bewaarde kopie alleen als er geen internet is.
  - App staat geïnstalleerd op de telefoon (via de echte Chrome-app, niet via een link in een andere app).
  - `iconen/`: app-icoon in Fortuna Sittard-stijl: geel agendablaadje met voetbal op groen
    (eigen ontwerp, niet het officiële clublogo). `icoon.svg` is het origineel, de PNG's zijn daarvan gemaakt.

- Google-koppeling gebouwd (stap 6e):
  - `google.js`: inloggen met Google (Google Identity Services) en agenda's/afspraken ophalen
    via de Google Calendar API. Geen eigen server; de app praat rechtstreeks met Google.
  - Client-ID staat in `google.js` (openbaar, niet geheim). Het Client secret wordt NIET gebruikt.
  - Toegang (token) is ~1 uur geldig en wordt op het apparaat bewaard; daarna één tik op "Inloggen met Google".
  - De voorbeeldafspraken zijn weg; de app toont nu de aangevinkte agenda's uit Google, in hun Google-kleur.
  - Bij terugkeren naar de app worden de afspraken ververst.

- Importeerhulp, ronde 1 (stap 6f):
  - Waarom: Google Agenda importeert via de gewone knop maximaal 1 MB; ons bestand is 167 MB.
  - `ics.js`: leest een .ics-bestand stukje voor stukje (ook heel grote bestanden), slaat bijlagen en HTML-tekst over.
  - `importeren.html` + `importeren.js`: overzicht van aantallen per categorie en per jaar. Verandert nog niets in Google.
  - Te openen via de link "Importeren" in de app. Het bestand blijft op het apparaat.
- Importeerhulp, ronde 2:
  - `omzetten.js`: zet .ics-afspraken om naar Google (Windows-tijdzones → internationale namen,
    herhalingen, uitzonderingen, hele-dag-afspraken).
  - Maakt agenda's "Werk (Outlook)" (groen) en "Reizen" (blauwgroen) aan als ze nog niet bestaan.
  - Elke afspraak krijgt een vaste ID, dus opnieuw starten maakt geen dubbele afspraken.
  - Geen uitnodigingen/e-mails (sendUpdates=none), geen deelnemers, geen herinneringen.
  - Bij "te veel verzoeken" wacht hij even en probeert opnieuw.

- Bezet/vrij zichtbaar gemaakt (na stap 6):
  - Google kent per afspraak "Bezet" of "Beschikbaar" (vrij). De app leest dat nu uit.
  - Hele dag + bezet: vol gekleurd blok bovenaan én de hele dagkolom volledig ingekleurd (dag is geblokt). Eerst schuine strepen, op verzoek vervangen door volledig ingekleurd.
  - Vrij (alleen ter herinnering): lichte achtergrond met gekleurd randje. Geldt ook voor afspraken met een tijd.
  - In het detailvenster staat "Bezet" of "Vrij".
  - Aanpassen per afspraak: nu via de Google Agenda-app (potloodje → Bezet/Beschikbaar), straks ook in onze app (stap 7).

- Afspraken toevoegen, aanpassen en verwijderen (stap 7):
  - `bewerken.js`: formulier, opslaan naar Google, verwijderen, vraagvensters.
  - Nieuwe afspraak: ronde +knop rechtsonder, of tik op een leeg tijdvak (dag en half uur staan dan al ingevuld),
    of tik op een lege plek in de hele-dag-strook.
  - Velden: titel, hele dag, begin/eind, agenda, bezet/vrij, herhalen (+ tot en met), locatie, notitie.
  - Standaard in de hoofdagenda. Nieuwe hele-dag-afspraak staat standaard op "vrij", met tijd op "bezet".
  - Herhalende afspraak aanpassen/verwijderen: de app vraagt "Alleen deze keer" of "Alle keren".
  - Agenda's die niet van jou zijn (Feestdagen) kun je niet aanpassen; de knoppen verschijnen daar niet.
  - Nooit e-mails of uitnodigingen naar anderen (sendUpdates=none).

## Gemaakte keuzes
- **Weergave:** knop om te kiezen tussen 1, 5 of 7 dagen. Standaard 7 dagen, week begint op maandag.
- **Uren:** 07:00–22:00 in beeld; vroeger en later bereikbaar door te scrollen.
- **Kleurstand:** automatisch licht/donker, zoals de telefoon is ingesteld.
- **Hele-dag-afspraken:** in een aparte strook bovenaan, zoals in Outlook.
- **Stap 7:** + knop én tikken op leeg vak; extra velden locatie, notitie en herhaling (geen herinneringen);
  standaard-agenda = hoofdagenda; bij herhalingen vragen "deze keer of alle keren".
- **Bezet/vrij:** bezet = vol blok (hele dag: plus volledig ingekleurde dagkolom); vrij = licht blok met gekleurde rand.
- **Opslag:** afspraken staan in Google Calendar; de app leest en schrijft via de Google Calendar API.
- **Hosting:** gratis via GitHub Pages.
- **Rol van het .ics-bestand:** wordt één keer geïmporteerd in Google Calendar (stap 6). Daarna is
  Google Calendar de echte agenda; het bestand in Drive is alleen nog een reservekopie.
- **Kleuren:** groen als hoofdkleur voor de app en het icoon.
- **Categorieën:** zoals in Outlook, bijv. Privé en Reizen, elk met een eigen kleur.
  Google Calendar kent geen Outlook-categorieën. Bij stap 6 kiezen we hoe we dat oplossen
  (bijv. per categorie een aparte Google-agenda).

## Volgende stap
Stap 7 testen op de telefoon (toevoegen, aanpassen, verwijderen). Daarna stap 8: verfijnen met extra wensen.
