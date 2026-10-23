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

function minutenInDag(datum) {
  return datum.getHours() * 60 + datum.getMinutes();
}

const tijdNotatie = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });
const dagNotatie = new Intl.DateTimeFormat('nl-NL', { weekday: 'short' });
const langeDatum = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const periodeNotatie = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

// ----- Afspraken uit Google -----
let agendas = [];            // de agenda's uit Google, met naam en kleur
let afspraken = [];          // de afspraken van de week die in beeld is
const weekCache = new Map(); // al opgehaalde weken, zodat terugbladeren snel gaat
let laadNummer = 0;          // om oude antwoorden te negeren als je snel doorklikt

// ----- Wat er nu op het scherm staat -----
const staat = {
  anker: beginVanDag(new Date()), // de dag waar we omheen kijken
  aantalDagen: leesBewaardAantalDagen(),
};

function leesBewaardAantalDagen() {
  try {
    const waarde = Number(localStorage.getItem('aantalDagen'));
    if ([1, 5, 7].includes(waarde)) return waarde;
  } catch (e) { /* niet erg, dan de standaard */ }
  return 7;
}

function bewaarAantalDagen() {
  try { localStorage.setItem('aantalDagen', String(staat.aantalDagen)); } catch (e) { /* niet erg */ }
}

function zichtbareDagen() {
  const eerste = staat.aantalDagen === 1 ? staat.anker : maandagVan(staat.anker);
  return Array.from({ length: staat.aantalDagen }, (_, i) => plusDagen(eerste, i));
}

// ----- Onderdelen van de pagina -----
const agendaEl = document.getElementById('agenda');
const periodeEl = document.getElementById('periode-tekst');
const weeknummerEl = document.getElementById('weeknummer');

// ----- Tekenen -----
function teken() {
  const dagen = zichtbareDagen();
  const vandaag = new Date();
  agendaEl.style.setProperty('--dagen', dagen.length);

  tekenPeriode(dagen);
  document.querySelectorAll('.weergave .knop').forEach(knop => {
    knop.classList.toggle('actief', Number(knop.dataset.dagen) === staat.aantalDagen);
  });

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
  for (const dag of dagen) {
    const cel = maak('div', 'heledag');
    const morgen = plusDagen(dag, 1);
    afspraken
      .filter(a => a.heleDag && a.start < morgen && a.eind > dag)
      .forEach(a => cel.append(maakAfspraakKnop(a)));
    kop.append(cel);
  }

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

function tekenPeriode(dagen) {
  const eerste = dagen[0];
  const laatste = dagen[dagen.length - 1];
  periodeEl.textContent = dagen.length === 1
    ? langeDatum.format(eerste)
    : periodeNotatie.formatRange(eerste, laatste);
  weeknummerEl.textContent = `week ${weeknummer(eerste)}`;
}

// Afspraken met een tijd op één dag, met hun plek naast elkaar als ze overlappen
function afsprakenOpDag(dag) {
  const morgen = plusDagen(dag, 1);
  const stukken = afspraken
    .filter(a => !a.heleDag && a.start < morgen && a.eind > dag)
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

function maakAfspraakKnop(afspraak) {
  const knop = maak('button', 'afspraak');
  knop.style.setProperty('--kleur', afspraak.agenda.kleur);
  const titel = maak('strong');
  titel.textContent = afspraak.titel;
  knop.append(titel);
  if (!afspraak.heleDag) {
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
function toonDetails(afspraak) {
  document.getElementById('details-kleur').style.setProperty('--kleur', afspraak.agenda.kleur);
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
  document.getElementById('details').showModal();
}

// Tik naast het venster om het te sluiten
document.getElementById('details').addEventListener('click', e => {
  if (e.target.id === 'details') e.target.close();
});

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
  document.getElementById('uitloggen').hidden = !isIngelogd();
}

function zetStatus(tekst, isFout = false) {
  const status = document.getElementById('status');
  status.textContent = tekst;
  status.classList.toggle('fout', isFout);
}

// ----- Afspraken van de week in beeld ophalen -----
async function laadWeek({ opnieuw = false } = {}) {
  const inlogbalk = document.getElementById('inlogbalk');
  if (!isIngelogd()) {
    inlogbalk.hidden = false;
    agendas = [];
    afspraken = [];
    weekCache.clear();
    tekenLegenda();
    teken();
    return;
  }
  inlogbalk.hidden = true;
  if (opnieuw) weekCache.clear();

  const maandag = maandagVan(staat.anker);
  const sleutel = maandag.toDateString();
  if (weekCache.has(sleutel)) {
    afspraken = weekCache.get(sleutel);
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
    const lijst = await haalAfspraken(agendas, maandag, plusDagen(maandag, 7));
    weekCache.set(sleutel, lijst);
    if (nummer !== laadNummer) return; // intussen naar een andere week gegaan
    afspraken = lijst;
    zetStatus('');
    teken();
  } catch (fout) {
    if (nummer !== laadNummer) return;
    zetStatus('');
    if (fout instanceof NietIngelogdFout) laadWeek(); // toont de inlogknop
    else zetStatus(fout.message, true);
  }
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
  const stap = staat.aantalDagen === 1 ? 1 : 7;
  staat.anker = plusDagen(staat.anker, richting * stap);
  teken();
  laadWeek();
}

document.getElementById('vorige').addEventListener('click', () => verschuif(-1));
document.getElementById('volgende').addEventListener('click', () => verschuif(1));
document.getElementById('vandaag').addEventListener('click', () => {
  staat.anker = beginVanDag(new Date());
  teken();
  scrollNaarBegin();
  laadWeek();
});

document.querySelectorAll('.weergave .knop').forEach(knop => {
  knop.addEventListener('click', () => {
    const nieuw = Number(knop.dataset.dagen);
    // Van week naar 1 dag: toon vandaag als die in deze week valt, anders de maandag
    if (nieuw === 1 && staat.aantalDagen !== 1) {
      const vandaag = beginVanDag(new Date());
      const zichtbaar = zichtbareDagen().some(d => zelfdeDag(d, vandaag));
      staat.anker = zichtbaar ? vandaag : maandagVan(staat.anker);
    }
    staat.aantalDagen = nieuw;
    bewaarAantalDagen();
    teken();
    laadWeek();
  });
});

// ----- Inloggen en uitloggen -----
document.getElementById('inloggen').addEventListener('click', async () => {
  const melding = document.getElementById('inlogmelding');
  melding.textContent = '';
  try {
    await logIn();
    await laadWeek({ opnieuw: true });
  } catch (fout) {
    melding.textContent = fout.message;
  }
});

document.getElementById('uitloggen').addEventListener('click', () => {
  logUit();
  laadWeek();
});

// Als je terugkomt in de app: afspraken verversen (bijv. na een wijziging op je telefoon)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') laadWeek({ opnieuw: true });
});

// Opnieuw meten als het scherm draait of het venster groter/kleiner wordt
window.addEventListener('resize', pasUurHoogteAan);

// Elke minuut de rode "nu"-lijn bijwerken
setInterval(teken, 60 * 1000);

// ----- Installeerbaar maken (PWA) -----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// ----- Starten -----
teken();
scrollNaarBegin();
laadWeek();
