// =====================================================================
// Importeren, ronde 1: een overzicht van wat er in het .ics-bestand staat.
// =====================================================================

const GEEN_CATEGORIE = 'Geen categorie';
let gelezen = null; // het resultaat van leesIcs, bewaard voor ronde 2

document.getElementById('bestand').addEventListener('change', async e => {
  const bestand = e.target.files[0];
  if (!bestand) return;

  const melding = document.getElementById('melding');
  const voortgang = document.getElementById('voortgang');
  const balk = document.getElementById('voortgang-balk');
  document.getElementById('overzicht').hidden = true;
  voortgang.hidden = false;
  melding.textContent = `Bezig met lezen van ${bestand.name} (${megabytes(bestand.size)})…`;

  try {
    gelezen = await leesIcs(bestand, fractie => { balk.style.width = `${fractie * 100}%`; });
    if (gelezen.afspraken.length === 0) {
      melding.textContent = 'Er zijn geen afspraken gevonden in dit bestand. Is het wel een agendabestand (.ics)?';
      return;
    }
    melding.textContent = `Klaar: ${bestand.name} is gelezen.`;
    toonOverzicht(gelezen);
    toonPlan();
  } catch (fout) {
    melding.textContent = 'Het lezen is mislukt: ' + fout.message;
  } finally {
    voortgang.hidden = true;
  }
});

function toonOverzicht({ afspraken, bijlagen }) {
  const vandaag = vandaagAlsTekst();
  const gewoon = afspraken.filter(a => !a.uitzondering);
  const uitzonderingen = afspraken.length - gewoon.length;
  const reeksen = gewoon.filter(a => a.herhaling);
  const actueel = a => (a.start && a.start.waarde.slice(0, 8) >= vandaag) || reeksLooptNog(a, vandaag);

  // Kaarten met de hoofdgetallen
  const kaarten = document.getElementById('kaarten');
  kaarten.replaceChildren(
    kaart(getal(gewoon.length), 'afspraken in totaal'),
    kaart(getal(gewoon.filter(actueel).length), 'nog actueel'),
    kaart(getal(reeksen.length), 'herhalende afspraken'),
    kaart(getal(bijlagen), 'bijlagen (slaan we over)'),
  );
  if (uitzonderingen) kaarten.append(kaart(getal(uitzonderingen), 'aangepaste keren van herhalingen'));
  const jaren = gewoon.map(a => a.jaar).filter(Boolean);
  if (jaren.length) kaarten.append(kaart(`${Math.min(...jaren)}–${Math.max(...jaren)}`, 'periode'));

  // Per categorie
  const perCategorie = new Map();
  for (const a of gewoon) {
    for (const c of a.categorieen.length ? a.categorieen : [GEEN_CATEGORIE]) {
      const telling = perCategorie.get(c) || { totaal: 0, actueel: 0 };
      telling.totaal++;
      if (actueel(a)) telling.actueel++;
      perCategorie.set(c, telling);
    }
  }
  const categorieen = [...perCategorie.keys()].sort((a, b) => perCategorie.get(b).totaal - perCategorie.get(a).totaal);
  vulTabel('tabel-categorie', ['Categorie', 'Totaal', 'Nog actueel'],
    categorieen.map(c => [c, getal(perCategorie.get(c).totaal), getal(perCategorie.get(c).actueel)]));

  // Per jaar, uitgesplitst naar categorie
  const perJaar = new Map();
  for (const a of gewoon) {
    const jaar = a.jaar || '?';
    const rij = perJaar.get(jaar) || new Map();
    for (const c of a.categorieen.length ? a.categorieen : [GEEN_CATEGORIE]) rij.set(c, (rij.get(c) || 0) + 1);
    rij.set('totaal', (rij.get('totaal') || 0) + 1);
    perJaar.set(jaar, rij);
  }
  const jaarRijen = [...perJaar.keys()].sort((a, b) => String(b).localeCompare(String(a)));
  vulTabel('tabel-jaar', ['Jaar', 'Totaal', ...categorieen],
    jaarRijen.map(j => [j, getal(perJaar.get(j).get('totaal')), ...categorieen.map(c => getal(perJaar.get(j).get(c) || 0))]));

  document.getElementById('overzicht').hidden = false;
}

// =====================================================================
// Ronde 2: overzetten naar Google
// =====================================================================

const AGENDA_WERK = { naam: 'Werk (Outlook)', kleur: '#2e7d32' };
const AGENDA_REIZEN = { naam: 'Reizen', kleur: '#00897b' };
const REIS_CATEGORIEEN = ['travelling', 'traveling', 'travel', 'reizen'];
const TEGELIJK = 4; // zoveel verzoeken tegelijk naar Google

function isReis(afspraak) {
  return afspraak.categorieen.some(c => REIS_CATEGORIEEN.includes(c.toLowerCase()));
}

// Welke afspraken gaan mee bij de gekozen datum?
function maakPlan(afspraken, grens) {
  const moetMee = a => {
    if (a.start.waarde.slice(0, 8) >= grens) return true;
    if (!a.herhaling) return false;
    const tot = /UNTIL=(\d{8})/.exec(a.herhaling);
    if (tot) return tot[1] >= grens;
    if (/COUNT=/.test(a.herhaling)) return a.jaar >= Number(grens.slice(0, 4)) - 1;
    return true; // herhaalt zonder einde
  };
  const reeksen = afspraken.filter(a => !a.uitzondering && a.start && moetMee(a));
  const reeksUids = new Set(reeksen.filter(a => a.herhaling).map(a => a.uid));
  const keren = afspraken.filter(a => a.uitzondering && a.start
    && (reeksUids.has(a.uid) || a.start.waarde.slice(0, 8) >= grens));
  return { afspraken: reeksen, keren };
}

function grensUitInvoer() {
  return (document.getElementById('vanaf').value || '2026-01-01').replace(/-/g, '');
}

function toonPlan() {
  const plan = maakPlan(gelezen.afspraken, grensUitInvoer());
  const reizen = plan.afspraken.filter(isReis).length;
  document.getElementById('plan').replaceChildren(
    kaart(getal(plan.afspraken.length - reizen), `naar "${AGENDA_WERK.naam}"`),
    kaart(getal(reizen), `naar "${AGENDA_REIZEN.naam}"`),
    kaart(getal(plan.keren.length), 'aangepaste keren van herhalingen'),
  );
  document.getElementById('inlog-import').hidden = isIngelogd();
  document.getElementById('ronde2').hidden = false;
}

document.getElementById('vanaf').addEventListener('change', toonPlan);

document.getElementById('inloggen').addEventListener('click', async () => {
  try {
    await logIn();
    document.getElementById('inlog-import').hidden = true;
  } catch (fout) {
    document.getElementById('melding2').textContent = fout.message;
  }
});

document.getElementById('start').addEventListener('click', async () => {
  const knop = document.getElementById('start');
  const melding = document.getElementById('melding2');
  if (!isIngelogd()) {
    document.getElementById('inlog-import').hidden = false;
    melding.textContent = 'Log eerst in met Google.';
    return;
  }
  knop.disabled = true;
  try {
    await zetOver(maakPlan(gelezen.afspraken, grensUitInvoer()));
  } catch (fout) {
    melding.textContent = fout instanceof NietIngelogdFout
      ? 'Je inlog is verlopen. Log opnieuw in en klik nog eens op Start; wat al klaar is, wordt overgeslagen.'
      : 'Er ging iets mis: ' + fout.message;
    document.getElementById('inlog-import').hidden = isIngelogd();
  } finally {
    knop.disabled = false;
  }
});

async function zetOver(plan) {
  const melding = document.getElementById('melding2');
  const voortgang = document.getElementById('voortgang2');
  const balk = document.getElementById('voortgang2-balk');
  const mislukt = [];
  const telling = { nieuw: 0, aangepast: 0, bestond: 0, mislukt: 0 };
  const totaal = plan.afspraken.length + plan.keren.length;
  let klaar = 0;
  let gestopt = null;

  const toonStand = () => {
    balk.style.width = `${(klaar / totaal) * 100}%`;
    melding.textContent = `Bezig… ${getal(klaar)} van ${getal(totaal)} ` +
      `(${getal(telling.nieuw)} nieuw, ${getal(telling.aangepast)} keren aangepast, ` +
      `${getal(telling.bestond)} stonden er al, ${getal(telling.mislukt)} niet gelukt)`;
  };
  voortgang.hidden = false;
  melding.textContent = 'Agenda\'s klaarzetten…';

  // 1. De twee agenda's zoeken, of aanmaken als ze er nog niet zijn
  const lijst = (await googleVraag('/users/me/calendarList')).items;
  const werkId = await zoekOfMaakAgenda(lijst, AGENDA_WERK);
  const reizenId = await zoekOfMaakAgenda(lijst, AGENDA_REIZEN);
  const agendaVoorReeks = new Map(); // uid → agenda, zodat aangepaste keren bij hun reeks komen

  // Eén taak uitvoeren; fouten worden genoteerd zonder alles te stoppen
  const doe = (afspraak, werk) => async () => {
    if (gestopt) return;
    try {
      telling[await metHerhaling(werk)]++;
    } catch (fout) {
      if (fout instanceof NietIngelogdFout) { gestopt = fout; return; }
      telling.mislukt++;
      mislukt.push([afspraak.titel || '(geen titel)', datumTekst(afspraak.start.waarde), fout.message]);
    }
    klaar++;
    toonStand();
  };

  // 2. Losse afspraken en herhalende reeksen
  const taken = plan.afspraken.map(afspraak => doe(afspraak, async () => {
    const agendaId = isReis(afspraak) ? reizenId : werkId;
    const id = await vasteId(afspraak.herhaling ? afspraak.uid : `${afspraak.uid}|${afspraak.start.waarde}`);
    if (afspraak.herhaling) agendaVoorReeks.set(afspraak.uid, { agendaId, id });
    return voegToe(agendaId, { ...naarGoogleAfspraak(afspraak), id });
  }));
  await voerUit(taken, TEGELIJK);
  if (gestopt) throw gestopt;

  // 3. Aangepaste keren van herhalende afspraken (bijv. één keer verplaatst)
  const kerenTaken = plan.keren.map(keer => doe(keer, async () => {
    const reeks = agendaVoorReeks.get(keer.uid);
    const herhalingsId = keer.eigenschappen['RECURRENCE-ID'][0];
    const google = naarGoogleAfspraak(keer);
    delete google.recurrence;
    if (reeks) {
      try {
        await googleVraag(`/calendars/${encodeURIComponent(reeks.agendaId)}/events/${idVanKeer(reeks.id, herhalingsId)}`,
          { sendUpdates: 'none' }, { methode: 'PATCH', inhoud: google });
        return 'aangepast';
      } catch (fout) {
        if (!(fout instanceof GoogleFout) || ![400, 404, 410].includes(fout.status)) throw fout;
        // die keer bestaat niet in de reeks: dan als losse afspraak toevoegen
      }
    }
    if (google.status === 'cancelled') return 'bestond'; // een geschrapte keer zonder reeks: niets te doen
    const agendaId = reeks ? reeks.agendaId : (isReis(keer) ? reizenId : werkId);
    const id = await vasteId(`${keer.uid}|${herhalingsId.waarde}`);
    return voegToe(agendaId, { ...google, id });
  }));
  await voerUit(kerenTaken, TEGELIJK);
  if (gestopt) throw gestopt;

  balk.style.width = '100%';
  melding.textContent = `Klaar! ${getal(telling.nieuw)} afspraken toegevoegd, ` +
    `${getal(telling.aangepast)} keren van herhalingen aangepast, ` +
    `${getal(telling.bestond)} stonden er al, ${getal(telling.mislukt)} niet gelukt.`;
  if (onbekendeTijdzones.size) {
    melding.textContent += ` Let op: onbekende tijdzones (${[...onbekendeTijdzones].join(', ')}) zijn als Amsterdam-tijd overgenomen.`;
  }
  const misluktBlok = document.getElementById('mislukt');
  misluktBlok.hidden = mislukt.length === 0;
  if (mislukt.length) vulTabel('tabel-mislukt', ['Afspraak', 'Datum', 'Reden'], mislukt);
}

async function zoekOfMaakAgenda(lijst, { naam, kleur }) {
  const bestaand = lijst.find(a => (a.summaryOverride || a.summary) === naam && a.accessRole === 'owner');
  if (bestaand) return bestaand.id;
  const nieuw = await googleVraag('/calendars', {}, { methode: 'POST', inhoud: { summary: naam, timeZone: STANDAARD_TIJDZONE } });
  await googleVraag(`/users/me/calendarList/${encodeURIComponent(nieuw.id)}`, { colorRgbFormat: 'true' },
    { methode: 'PATCH', inhoud: { backgroundColor: kleur, foregroundColor: '#ffffff', selected: true } });
  return nieuw.id;
}

// Afspraak toevoegen; bestaat hij al (zelfde vaste ID), dan is dat ook goed
async function voegToe(agendaId, google) {
  try {
    await googleVraag(`/calendars/${encodeURIComponent(agendaId)}/events`, { sendUpdates: 'none' },
      { methode: 'POST', inhoud: google });
    return 'nieuw';
  } catch (fout) {
    if (fout instanceof GoogleFout && fout.status === 409) return 'bestond';
    throw fout;
  }
}

// Bij "te veel verzoeken" of een storing bij Google: even wachten en opnieuw proberen
async function metHerhaling(werk) {
  for (let poging = 0; ; poging++) {
    try {
      return await werk();
    } catch (fout) {
      const tijdelijk = fout instanceof GoogleFout && (fout.status === 429 || fout.status >= 500
        || (fout.status === 403 && /rateLimit|quota/i.test(fout.reden)));
      if (!tijdelijk || poging >= 5) throw fout;
      await new Promise(klaar => setTimeout(klaar, 1000 * 2 ** poging + Math.random() * 500));
    }
  }
}

// Voert de taken uit, steeds een paar tegelijk
async function voerUit(taken, tegelijk) {
  let volgende = 0;
  await Promise.all(Array.from({ length: tegelijk }, async () => {
    while (volgende < taken.length) await taken[volgende++]();
  }));
}

// ----- Hulpjes -----
function kaart(waarde, uitleg) {
  const el = document.createElement('div');
  el.className = 'kaart';
  const b = document.createElement('b');
  b.textContent = waarde;
  const span = document.createElement('span');
  span.textContent = uitleg;
  el.append(b, span);
  return el;
}

function vulTabel(id, koppen, rijen) {
  const tabel = document.getElementById(id);
  const kop = document.createElement('tr');
  for (const k of koppen) {
    const th = document.createElement('th');
    th.textContent = k;
    kop.append(th);
  }
  const lijst = rijen.map(rij => {
    const tr = document.createElement('tr');
    for (const cel of rij) {
      const td = document.createElement('td');
      td.textContent = cel;
      tr.append(td);
    }
    return tr;
  });
  tabel.replaceChildren(kop, ...lijst);
}

function getal(n) {
  return n.toLocaleString('nl-NL');
}

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} MB`;
}

function vandaagAlsTekst() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
