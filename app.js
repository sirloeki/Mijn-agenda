// =====================================================================
// Mijn Agenda
// Toont een weekweergave met je afspraken uit Google Agenda.
// Het praten met Google zelf staat in google.js.
// =====================================================================

// ----- Instellingen -----
const EERSTE_UUR_IN_BEELD = 7;   // de agenda opent op 07:00
const LAATSTE_UUR_IN_BEELD = 22; // en 07:00–22:00 past precies op het scherm
const MINSTE_UUR_HOOGTE = 40;    // in pixels, zodat afspraken leesbaar blijven

// ----- Hulpjes voor datums -----
function beginVanDag(datum) {
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  return d;
}

function plusDagen(datum, aantal) {
  const d = new Date(datum);
  d.setDate(d.getDate() + aantal);
  return d;
}

// Maandag van de week waarin 'datum' valt
function maandagVan(datum) {
  const d = beginVanDag(datum);
  const dagenSindsMaandag = (d.getDay() + 6) % 7;
  return plusDagen(d, -dagenSindsMaandag);
}

function zelfdeDag(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// Weeknummer zoals in Nederland gebruikelijk (ISO-week)
function weeknummer(datum) {
  const donderdag = plusDagen(maandagVan(datum), 3);
  const vierJanuari = new Date(donderdag.getFullYear(), 0, 4);
  const eersteDonderdag = plusDagen(maandagVan(vierJanuari), 3);
  return 1 + Math.round((donderdag - eersteDonderdag) / (7 * 24 * 60 * 60 * 1000));
}

// Aantal dagen van a naar b (alleen de datum telt, niet de tijd)
function dagenTussen(a, b) {
  return Math.round((beginVanDag(b) - beginVanDag(a)) / 86400000);
}

function eersteVanMaand(datum) {
  return new Date(datum.getFullYear(), datum.getMonth(), 1);
}

// Duurt een afspraak een hele dag of langer? Dan tonen we hem als balk bovenaan
function isMeerdaags(afspraak) {
  return afspraak.heleDag || afspraak.eind - afspraak.start >= 24 * 60 * 60 * 1000;
}

function minutenInDag(datum) {
  return datum.getHours() * 60 + datum.getMinutes();
}

const tijdNotatie = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });
const dagNotatie = new Intl.DateTimeFormat('nl-NL', { weekday: 'short' });
const langeDatum = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const periodeNotatie = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
const maandNotatie = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });

// ----- Afspraken uit Google -----
let agendas = [];            // de agenda's uit Google, met naam en kleur
let afspraken = [];          // de afspraken van de week of maand die in beeld is
const weekCache = new Map(); // al opgehaalde weken, zodat terugbladeren snel gaat
let laadNummer = 0;          // om oude antwoorden te negeren als je snel doorklikt

// ----- Wat er nu op het scherm staat -----
const WEERGAVEN = ['1', '5', '7', 'maand'];
const staat = {
  anker: beginVanDag(new Date()), // de dag waar we omheen kijken
  weergave: leesBewaardeWeergave(), // '1', '5' of '7' dagen, of 'maand'
};

function leesBewaardeWeergave() {
  try {
    const waarde = localStorage.getItem('weergave') || localStorage.getItem('aantalDagen');
    if (WEERGAVEN.includes(waarde)) return waarde;
  } catch (e) { /* niet erg, dan de standaard */ }
  return '7';
}

function bewaarWeergave() {
  try { localStorage.setItem('weergave', staat.weergave); } catch (e) { /* niet erg */ }
}

function zichtbareDagen() {
  if (staat.weergave === 'maand') {
    // hele weken (ma–zo) van de week met de 1e tot en met de week met de laatste dag
    const eerste = maandagVan(eersteVanMaand(staat.anker));
    const laatste = new Date(staat.anker.getFullYear(), staat.anker.getMonth() + 1, 0);
    return Array.from({ length: dagenTussen(eerste, laatste) + 1 + (6 - (laatste.getDay() + 6) % 7) },
      (_, i) => plusDagen(eerste, i));
  }
  const aantal = Number(staat.weergave);
  const eerste = aantal === 1 ? staat.anker : maandagVan(staat.anker);
  return Array.from({ length: aantal }, (_, i) => plusDagen(eerste, i));
}

// ----- Onderdelen van de pagina -----
const agendaEl = document.getElementById('agenda');
const periodeEl = document.getElementById('periode-tekst');
const weeknummerEl = document.getElementById('weeknummer');

// ----- Tekenen -----
function teken() {
  const dagen = zichtbareDagen();
  tekenPeriode(dagen);
  document.querySelectorAll('.weergave .knop').forEach(knop => {
    knop.classList.toggle('actief', knop.dataset.weergave === staat.weergave);
  });
  agendaEl.classList.toggle('maandweergave', staat.weergave === 'maand');
  if (staat.weergave === 'maand') tekenMaand(dagen);
  else tekenWeek(dagen);
}

// Meerdaagse afspraken als balken over de dagen 'dagen' verdelen.
// Balken die elkaar overlappen komen op een eigen regel, onder elkaar.
function verdeelBalken(dagen, lijst) {
  const eerste = dagen[0];
  const na = plusDagen(dagen[dagen.length - 1], 1);
  const balken = lijst
    .filter(a => a.start < na && a.eind > eerste)
    .map(a => {
      const laatsteDag = beginVanDag(new Date(Math.max(a.start.getTime(), a.eind.getTime() - 1)));
      return {
        afspraak: a,
        van: Math.max(0, dagenTussen(eerste, a.start)),
        tot: Math.min(dagen.length, dagenTussen(eerste, laatsteDag) + 1), // tot en met, als 'na'
        eerderBegonnen: a.start < eerste,
        laterKlaar: laatsteDag >= na,
      };
    })
    .sort((x, y) => x.van - y.van || (y.tot - y.van) - (x.tot - x.van)
      || y.afspraak.heleDag - x.afspraak.heleDag || x.afspraak.start - y.afspraak.start);

  const regels = []; // per regel: de eerste dag die weer vrij is
  for (const balk of balken) {
    let regel = regels.findIndex(vrijVanaf => vrijVanaf <= balk.van);
    if (regel === -1) regel = regels.length;
    regels[regel] = balk.tot;
    balk.regel = regel;
  }
  return { balken, aantalRegels: regels.length };
}

function maakBalk(balk, metTijd = false) {
  const knop = maakAfspraakKnop(balk.afspraak, { alsBalk: true, metTijd });
  knop.classList.add('band');
  knop.classList.toggle('eerder-begonnen', balk.eerderBegonnen);
  knop.classList.toggle('later-klaar', balk.laterKlaar);
  knop.style.gridRow = String(balk.regel + 1);
  knop.style.gridColumn = `${balk.van + 1} / ${balk.tot + 1}`;
  return knop;
}

// ----- Weekweergave (1, 5 of 7 dagen) -----
function tekenWeek(dagen) {
  const vandaag = new Date();
  agendaEl.style.setProperty('--dagen', dagen.length);

  // Kop: dagnamen en hele-dag-strook
  const kop = maak('div', 'kop');
  kop.append(maak('div', 'hoek'));
  for (const dag of dagen) {
    const el = maak('div', 'dagnaam');
    if (zelfdeDag(dag, vandaag)) el.classList.add('vandaag');
    el.textContent = dagNotatie.format(dag).replace('.', '');
    const nummer = maak('b');
    nummer.textContent = dag.getDate();
    el.append(nummer);
    kop.append(el);
  }
  const heleDagLabel = maak('div', 'hoek');
  heleDagLabel.textContent = 'hele dag';
  kop.append(heleDagLabel);

  // Strook met hele-dag- en meerdaagse afspraken, als doorlopende balken
  const strook = maak('div', 'strook');
  const { balken, aantalRegels } = verdeelBalken(dagen, afspraken.filter(isMeerdaags));
  strook.style.gridTemplateRows = `repeat(${Math.max(1, aantalRegels)}, var(--band))`;
  dagen.forEach((dag, i) => {
    const cel = maak('div', 'heledag');
    cel.style.gridColumn = String(i + 1);
    // tik op een lege plek in de strook: nieuwe hele-dag-afspraak op die dag
    cel.addEventListener('click', () => {
      if (isIngelogd()) nieuweAfspraak(dag, true);
    });
    strook.append(cel);
  });
  for (const balk of balken) strook.append(maakBalk(balk));
  kop.append(strook);

  // Raster: tijden links, daarna een kolom per dag
  const raster = maak('div', 'raster');
  const tijden = maak('div', 'tijden');
  for (let uur = 1; uur < 24; uur++) {
    const t = maak('div', 'tijd');
    t.style.top = `calc(${uur} * var(--uur))`;
    t.textContent = `${String(uur).padStart(2, '0')}:00`;
    tijden.append(t);
  }
  raster.append(tijden);

  for (const dag of dagen) {
    const kolom = maak('div', 'dag');
    // tik op een leeg tijdvak: nieuwe afspraak op die dag en dat (halve) uur
    kolom.addEventListener('click', e => {
      if (e.target !== kolom || !isIngelogd()) return;
      const uurHoogte = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--uur'));
      const minuten = Math.floor((e.offsetY / uurHoogte) * 2) * 30;
      const start = new Date(dag);
      start.setMinutes(Math.min(minuten, 23 * 60));
      nieuweAfspraak(start, false);
    });
    // Een hele-dag-afspraak op "bezet" blokt de hele dag: die dag krijgt schuine strepen
    const morgen = plusDagen(dag, 1);
    const blokker = afspraken.find(a => isMeerdaags(a) && a.bezet && a.start < morgen && a.eind > dag);
    if (blokker) {
      kolom.classList.add('geblokt');
      kolom.style.setProperty('--kleur', blokker.kleur);
    }
    if (zelfdeDag(dag, vandaag)) {
      kolom.classList.add('vandaag');
      const nu = maak('div', 'nu');
      nu.style.top = `calc(${minutenInDag(vandaag) / 60} * var(--uur))`;
      kolom.append(nu);
    }
    for (const stuk of afsprakenOpDag(dag)) {
      const knop = maakAfspraakKnop(stuk.afspraak);
      knop.style.top = `calc(${stuk.van / 60} * var(--uur))`;
      knop.style.height = `calc(${(stuk.tot - stuk.van) / 60} * var(--uur) - 2px)`;
      knop.style.left = `calc(${(stuk.kolom / stuk.kolommen) * 100}% + 1px)`;
      knop.style.width = `calc(${100 / stuk.kolommen}% - 3px)`;
      kolom.append(knop);
    }
    raster.append(kolom);
  }

  agendaEl.replaceChildren(kop, raster);
}

// ----- Maandweergave -----
const MAAND_DAGNUMMER = 22; // pixels voor de regel met het dagnummer
const MAAND_REGEL = 18;     // pixels per afspraak

function tekenMaand(dagen) {
  const vandaag = new Date();
  const maand = staat.anker.getMonth();
  const aantalWeken = dagen.length / 7;

  const maandEl = maak('div', 'maand');
  const kop = maak('div', 'maand-kop');
  for (const dag of dagen.slice(0, 7)) {
    const naam = maak('div');
    naam.textContent = dagNotatie.format(dag).replace('.', '');
    kop.append(naam);
  }
  const weken = maak('div', 'maand-weken');
  weken.style.gridTemplateRows = `repeat(${aantalWeken}, minmax(0, 1fr))`;
  maandEl.append(kop, weken);
  agendaEl.replaceChildren(maandEl); // eerst plaatsen, dan kunnen we meten hoeveel ruimte er is

  // Hoeveel afspraken passen er onder elkaar in één dag?
  const rijHoogte = weken.clientHeight / aantalWeken;
  const plekken = Math.max(1, Math.floor((rijHoogte - MAAND_DAGNUMMER - 2) / MAAND_REGEL));

  for (let w = 0; w < aantalWeken; w++) {
    const week = dagen.slice(w * 7, w * 7 + 7);
    const rij = maak('div', 'maand-week');
    rij.style.gridTemplateRows = `${MAAND_DAGNUMMER}px repeat(${plekken}, ${MAAND_REGEL}px)`;
    const { balken } = verdeelBalken(week, afspraken);
    const opDag = (balk, i) => balk.van <= i && i < balk.tot;
    // dagen waar niet alles past: daar komt op de laatste plek "+3"
    const teVol = week.map((_, i) => balken.some(b => opDag(b, i) && b.regel >= plekken));

    week.forEach((dag, i) => {
      const cel = maak('div', 'maand-dag');
      cel.style.gridColumn = String(i + 1);
      cel.classList.toggle('andere-maand', dag.getMonth() !== maand);
      cel.classList.toggle('vandaag', zelfdeDag(dag, vandaag));
      const nummer = maak('span', 'dagnummer');
      nummer.textContent = dag.getDate();
      cel.append(nummer);
      cel.addEventListener('click', () => openDag(dag));
      rij.append(cel);

      if (teVol[i]) {
        const meer = maak('button', 'meer');
        meer.textContent = `+${balken.filter(b => opDag(b, i) && b.regel >= plekken - 1).length}`;
        meer.style.gridRow = String(plekken + 1);
        meer.style.gridColumn = String(i + 1);
        meer.addEventListener('click', () => openDag(dag));
        rij.append(meer);
      }
    });

    for (const balk of balken) {
      const dagenVanBalk = Array.from({ length: balk.tot - balk.van }, (_, k) => balk.van + k);
      const past = balk.regel < plekken - 1
        || (balk.regel === plekken - 1 && dagenVanBalk.every(i => !teVol[i]));
      if (!past) continue;
      const kort = !isMeerdaags(balk.afspraak);
      const el = maakBalk(balk, kort);
      el.classList.toggle('kort', kort);
      el.style.gridRow = String(balk.regel + 2);
      rij.append(el);
    }
    weken.append(rij);
  }
}

// Tik op een dag in de maand: ga naar die dag
function openDag(dag) {
  staat.weergave = '1';
  staat.anker = beginVanDag(dag);
  bewaarWeergave();
  teken();
  scrollNaarBegin();
  laadPeriode();
}

function tekenPeriode(dagen) {
  const eerste = dagen[0];
  const laatste = dagen[dagen.length - 1];
  if (staat.weergave === 'maand') {
    periodeEl.textContent = maandNotatie.format(staat.anker);
    weeknummerEl.textContent = `week ${weeknummer(eerste)}–${weeknummer(laatste)}`;
    return;
  }
  periodeEl.textContent = dagen.length === 1
    ? langeDatum.format(eerste)
    : periodeNotatie.formatRange(eerste, laatste);
  weeknummerEl.textContent = `week ${weeknummer(eerste)}`;
}

// Afspraken met een tijd op één dag, met hun plek naast elkaar als ze overlappen
function afsprakenOpDag(dag) {
  const morgen = plusDagen(dag, 1);
  const stukken = afspraken
    .filter(a => !isMeerdaags(a) && a.start < morgen && a.eind > dag)
    .map(a => {
      const van = a.start < dag ? 0 : minutenInDag(a.start);
      const tot = a.eind >= morgen ? 24 * 60 : minutenInDag(a.eind);
      // korte afspraken krijgen minstens 20 minuten ruimte, zodat de tekst past
      return { afspraak: a, van, tot: Math.max(tot, Math.min(van + 20, 24 * 60)) };
    })
    .sort((a, b) => a.van - b.van || b.tot - a.tot);

  // Verdeel overlappende afspraken over kolommen
  let groep = [];
  let groepEind = -1;
  const sluitGroep = () => {
    const kolomEinden = [];
    for (const stuk of groep) {
      let k = kolomEinden.findIndex(eind => eind <= stuk.van);
      if (k === -1) k = kolomEinden.length;
      kolomEinden[k] = stuk.tot;
      stuk.kolom = k;
    }
    groep.forEach(stuk => { stuk.kolommen = kolomEinden.length; });
    groep = [];
    groepEind = -1;
  };
  for (const stuk of stukken) {
    if (groep.length && stuk.van >= groepEind) sluitGroep();
    groep.push(stuk);
    groepEind = Math.max(groepEind, stuk.tot);
  }
  if (groep.length) sluitGroep();

  return stukken;
}

function maakAfspraakKnop(afspraak, { alsBalk = false, metTijd = false } = {}) {
  const knop = maak('button', afspraak.bezet ? 'afspraak' : 'afspraak vrij');
  knop.style.setProperty('--kleur', afspraak.kleur);
  knop.style.setProperty('--tekstkleur', afspraak.tekstkleur);
  const titel = maak('strong');
  titel.textContent = afspraak.titel;
  if (metTijd) {
    // in de maandweergave: "09:00 Titel" op één regel
    const tijd = maak('span', 'tijdje');
    tijd.textContent = tijdNotatie.format(afspraak.start) + ' ';
    titel.prepend(tijd);
  }
  knop.append(titel);
  if (!afspraak.heleDag && !alsBalk) {
    const tijd = maak('small');
    tijd.textContent = `${tijdNotatie.format(afspraak.start)} – ${tijdNotatie.format(afspraak.eind)}`;
    knop.append(tijd);
  }
  knop.addEventListener('click', () => toonDetails(afspraak));
  return knop;
}

function maak(tag, klasse) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  return el;
}

// ----- Details van een afspraak -----
let getoondeAfspraak = null;

function toonDetails(afspraak) {
  getoondeAfspraak = afspraak;
  document.getElementById('details-kleur').style.setProperty('--kleur', afspraak.kleur);
  document.getElementById('details-titel').textContent = afspraak.titel;

  let tijd;
  if (afspraak.heleDag) {
    const laatsteDag = plusDagen(afspraak.eind, -1);
    tijd = zelfdeDag(afspraak.start, laatsteDag)
      ? `${langeDatum.format(afspraak.start)} (hele dag)`
      : `${periodeNotatie.formatRange(afspraak.start, laatsteDag)} (hele dag)`;
  } else {
    tijd = `${langeDatum.format(afspraak.start)}, ${tijdNotatie.format(afspraak.start)} – ${tijdNotatie.format(afspraak.eind)}`;
  }
  document.getElementById('details-tijd').textContent = '🕒 ' + tijd;
  document.getElementById('details-locatie').textContent = afspraak.locatie ? '📍 ' + afspraak.locatie : '';
  document.getElementById('details-agenda').textContent = '🗓️ ' + afspraak.agenda.naam;
  document.getElementById('details-status').textContent = afspraak.bezet
    ? '⛔ Bezet (je bent niet beschikbaar)'
    : '✅ Vrij (alleen ter herinnering)';
  document.getElementById('details-herhaling').textContent = afspraak.reeksId ? '🔁 Herhalende afspraak' : '';
  document.getElementById('details-notitie').textContent = notitieAlsTekst(afspraak.notitie);
  // In agenda's die niet van jou zijn (zoals Feestdagen) kun je niets aanpassen
  document.getElementById('details-bewerken').hidden = !afspraak.agenda.schrijfbaar;
  document.getElementById('details-verwijderen').hidden = !afspraak.agenda.schrijfbaar;
  document.getElementById('details').showModal();
}

// Google bewaart notities soms als opgemaakte tekst (HTML); wij tonen gewone tekst
function notitieAlsTekst(notitie) {
  return notitie
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

document.getElementById('details-sluiten').addEventListener('click', () => {
  document.getElementById('details').close();
});

// Tik naast een venster om het te sluiten
for (const id of ['details', 'vraag']) {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) e.target.close();
  });
}

// ----- Legenda met de agenda's en hun kleur -----
function tekenLegenda() {
  const lijst = document.getElementById('legenda-agendas');
  lijst.replaceChildren();
  for (const agenda of agendas) {
    const item = maak('span');
    const bolletje = maak('i', 'bolletje');
    bolletje.style.setProperty('--kleur', agenda.kleur);
    item.append(bolletje, agenda.naam);
    lijst.append(item);
  }
  document.getElementById('uitloggen').hidden = !isIngelogd() && !eerderIngelogd();
}

function zetStatus(tekst, isFout = false) {
  const status = document.getElementById('status');
  status.textContent = tekst;
  status.classList.toggle('fout', isFout);
}

// ----- Afspraken van de week of maand in beeld ophalen -----
// We halen per week op en bewaren elke week, zodat terugbladeren snel gaat.
async function laadPeriode({ opnieuw = false } = {}) {
  const inlogbalk = document.getElementById('inlogbalk');
  document.getElementById('nieuw').hidden = !isIngelogd();
  if (!isIngelogd()) {
    inlogbalk.hidden = false;
    document.getElementById('inlogtekst').textContent = eerderIngelogd()
      ? 'Je inlog is verlopen. Tik ergens in de app, dan log je vanzelf opnieuw in.'
      : 'Log in met Google om je afspraken te zien.';
    if (!eerderIngelogd()) {
      // uitgelogd: niets meer laten zien
      agendas = [];
      weekCache.clear();
    }
    // verlopen: laat zien wat we al hadden opgehaald, tot je weer bent ingelogd
    const maandagen = [...new Set(zichtbareDagen().map(d => maandagVan(d).getTime()))].map(t => new Date(t));
    afspraken = afsprakenUitCache(maandagen);
    tekenLegenda();
    teken();
    return;
  }
  inlogbalk.hidden = true;
  if (opnieuw) weekCache.clear();

  const dagen = zichtbareDagen();
  const maandagen = [...new Set(dagen.map(d => maandagVan(d).getTime()))].map(t => new Date(t));
  const ontbrekend = maandagen.filter(m => !weekCache.has(m.toDateString()));
  if (ontbrekend.length === 0) {
    afspraken = afsprakenUitCache(maandagen);
    teken();
    return;
  }

  const nummer = ++laadNummer;
  zetStatus('Laden…');
  try {
    if (opnieuw || agendas.length === 0) {
      agendas = await haalAgendas();
      tekenLegenda();
    }
    await Promise.all(ontbrekend.map(async maandag => {
      weekCache.set(maandag.toDateString(), await haalAfspraken(agendas, maandag, plusDagen(maandag, 7)));
    }));
    if (nummer !== laadNummer) return; // intussen naar een andere week gegaan
    afspraken = afsprakenUitCache(maandagen);
    zetStatus('');
    teken();
    kleurBezetteDagen(afspraken);
  } catch (fout) {
    if (nummer !== laadNummer) return;
    zetStatus('');
    if (fout instanceof NietIngelogdFout) laadPeriode(); // toont de inlogknop
    else zetStatus(fout.message, true);
  }
}

// Bezette hele-dag-afspraken zonder eigen kleur maken we in Google rood (Tomaat),
// zodat ze ook in de Google Agenda-app opvallen. Dit gebeurt per afspraak maar één keer.
const alGekleurd = new Set();

async function kleurBezetteDagen(lijst) {
  const teKleuren = lijst.filter(a => a.heleDag && a.bezet && !a.kleurId && a.agenda.eigenaar
    && !alGekleurd.has(`${a.agenda.id}|${a.reeksId || a.id}`));
  if (teKleuren.length === 0) return;

  for (const a of teKleuren) {
    // bij een herhalende afspraak kleuren we de hele reeks, niet elke keer apart
    const id = a.reeksId || a.id;
    const sleutel = `${a.agenda.id}|${id}`;
    if (alGekleurd.has(sleutel)) continue;
    alGekleurd.add(sleutel);
    try {
      await wijzigAfspraak(a.agenda.id, id, { colorId: KLEUR_BEZET });
    } catch (fout) {
      continue; // lukt het niet, dan blijft de afspraak gewoon zoals hij was
    }
  }
  for (const a of teKleuren) {
    if (!alGekleurd.has(`${a.agenda.id}|${a.reeksId || a.id}`)) continue;
    a.kleurId = KLEUR_BEZET;
    a.kleur = AFSPRAAK_KLEUREN[KLEUR_BEZET];
    a.tekstkleur = '#ffffff';
  }
  teken();
}

// Alle afspraken van de gegeven weken; een afspraak over twee weken heen maar één keer
function afsprakenUitCache(maandagen) {
  const gezien = new Map();
  for (const maandag of maandagen) {
    for (const a of weekCache.get(maandag.toDateString()) || []) gezien.set(`${a.agenda.id}|${a.id}`, a);
  }
  return [...gezien.values()];
}

// ----- Hoogte van een uur aanpassen aan het scherm -----
function pasUurHoogteAan() {
  const kop = agendaEl.querySelector('.kop');
  const beschikbaar = agendaEl.clientHeight - (kop ? kop.offsetHeight : 0);
  const uren = LAATSTE_UUR_IN_BEELD - EERSTE_UUR_IN_BEELD;
  const hoogte = Math.max(MINSTE_UUR_HOOGTE, Math.floor(beschikbaar / uren));
  document.documentElement.style.setProperty('--uur', `${hoogte}px`);
  return hoogte;
}

function scrollNaarBegin() {
  const hoogte = pasUurHoogteAan();
  agendaEl.scrollTop = EERSTE_UUR_IN_BEELD * hoogte - 10; // iets ruimte, zodat "07:00" zichtbaar is
}

// ----- Knoppen -----
function verschuif(richting) {
  if (staat.weergave === 'maand') {
    staat.anker = new Date(staat.anker.getFullYear(), staat.anker.getMonth() + richting, 1);
  } else {
    staat.anker = plusDagen(staat.anker, richting * (staat.weergave === '1' ? 1 : 7));
  }
  teken();
  laadPeriode();
}

document.getElementById('vorige').addEventListener('click', () => verschuif(-1));
document.getElementById('volgende').addEventListener('click', () => verschuif(1));
document.getElementById('vandaag').addEventListener('click', () => {
  staat.anker = beginVanDag(new Date());
  teken();
  scrollNaarBegin();
  laadPeriode();
});

document.querySelectorAll('.weergave .knop').forEach(knop => {
  knop.addEventListener('click', () => {
    const nieuw = knop.dataset.weergave;
    // Naar een kleinere weergave: toon vandaag als die nu in beeld is, anders het begin
    if (nieuw !== staat.weergave && nieuw !== 'maand') {
      const vandaag = beginVanDag(new Date());
      const zichtbaar = zichtbareDagen().some(d => zelfdeDag(d, vandaag));
      if (zichtbaar) staat.anker = vandaag;
      else if (staat.weergave === 'maand') staat.anker = eersteVanMaand(staat.anker);
      else if (nieuw === '1') staat.anker = maandagVan(staat.anker);
    }
    staat.weergave = nieuw;
    bewaarWeergave();
    teken();
    if (nieuw !== 'maand') scrollNaarBegin();
    laadPeriode();
  });
});

// ----- Inloggen en uitloggen -----
let lopendeInlog = null; // zodat twee tikken niet twee keer een inlogvenster openen

// Geeft true als het inloggen gelukt is
function opnieuwInloggen() {
  if (lopendeInlog) return lopendeInlog;
  const melding = document.getElementById('inlogmelding');
  melding.textContent = '';
  lopendeInlog = (async () => {
    try {
      await logIn();
      await laadPeriode({ opnieuw: true });
      return true;
    } catch (fout) {
      melding.textContent = fout.message;
      return false;
    } finally {
      lopendeInlog = null;
    }
  })();
  return lopendeInlog;
}

document.getElementById('inloggen').addEventListener('click', opnieuwInloggen);

// Automatisch opnieuw inloggen: is je inlog verlopen, dan doet je eerstvolgende tik dat vanzelf.
// (Google laat het inlogvenster alleen openen na een tik van jou, daarom wachten we daarop.)
document.addEventListener('click', e => {
  if (isIngelogd() || !eerderIngelogd() || e.target.closest('#inloggen, #uitloggen')) return;
  opnieuwInloggen();
}, true);

document.getElementById('uitloggen').addEventListener('click', () => {
  logUit({ helemaal: true });
  laadPeriode();
});

// Als je terugkomt in de app: afspraken verversen (bijv. na een wijziging op je telefoon)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') laadPeriode({ opnieuw: true });
});

// Opnieuw meten als de ruimte voor de agenda verandert (scherm draait, inlogbalk verdwijnt, ...).
// We blijven daarbij naar hetzelfde tijdstip kijken.
new ResizeObserver(() => {
  if (staat.weergave === 'maand') {
    teken(); // hoeveel afspraken per dag passen, hangt af van de schermhoogte
    return;
  }
  const oudeHoogte = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--uur'));
  const urenBoven = agendaEl.scrollTop / oudeHoogte;
  const nieuweHoogte = pasUurHoogteAan();
  agendaEl.scrollTop = urenBoven * nieuweHoogte;
}).observe(agendaEl);

// Elke minuut de rode "nu"-lijn bijwerken
setInterval(teken, 60 * 1000);

// ----- Installeerbaar maken (PWA) -----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// ----- Starten -----
teken();
scrollNaarBegin();
laadPeriode();
