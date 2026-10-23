# Voortgang – Mijn Agenda

Logboek van wat we gedaan hebben, welke keuzes we maakten en wat de volgende stap is.

## Stappenplan
1. [x] Plan en vragen
2. [x] GitHub-project opzetten (repository `Mijn-agenda` bestaat al)
3. [x] Eerste versie: weekweergave met voorbeeldafspraken
4. [x] Online zetten via GitHub Pages en testen op telefoon
5. [x] Installeerbaar maken als app met icoon (PWA)
6. [ ] Koppeling met Google Calendar (bezig)
   - [ ] 6a. Google Cloud-project aanmaken
   - [ ] 6b. Google Calendar API aanzetten
   - [ ] 6c. Toestemmingsscherm instellen + jezelf als testgebruiker
   - [ ] 6d. Client-ID (inlogsleutel voor de app) maken
   - [ ] 6e. Inloggen en afspraken lezen in de app bouwen
   - [ ] 6f. Outlook-afspraken (.ics) importeren en categorieën regelen
7. [ ] Afspraken toevoegen, aanpassen en verwijderen
8. [ ] Verfijnen met extra wensen

## Gedaan
- Outlook-agenda geëxporteerd als .ics en veilig bewaard in Google Drive (niet in GitHub, want privé).
- Het .ics-bestand is nog NIET in Google Calendar geïmporteerd. Dat doen we bij stap 6.
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

## Gemaakte keuzes
- **Weergave:** knop om te kiezen tussen 1, 5 of 7 dagen. Standaard 7 dagen, week begint op maandag.
- **Uren:** 07:00–22:00 in beeld; vroeger en later bereikbaar door te scrollen.
- **Kleurstand:** automatisch licht/donker, zoals de telefoon is ingesteld.
- **Hele-dag-afspraken:** in een aparte strook bovenaan, zoals in Outlook.
- **Opslag:** afspraken staan in Google Calendar; de app leest en schrijft via de Google Calendar API.
- **Hosting:** gratis via GitHub Pages.
- **Rol van het .ics-bestand:** wordt één keer geïmporteerd in Google Calendar (stap 6). Daarna is
  Google Calendar de echte agenda; het bestand in Drive is alleen nog een reservekopie.
- **Kleuren:** groen als hoofdkleur voor de app en het icoon.
- **Categorieën:** zoals in Outlook, bijv. Privé en Reizen, elk met een eigen kleur.
  Google Calendar kent geen Outlook-categorieën. Bij stap 6 kiezen we hoe we dat oplossen
  (bijv. per categorie een aparte Google-agenda).

## Volgende stap
Stap 6: koppeling met Google Calendar (Google Cloud-project, inloggen met Google, .ics importeren).
