// =====================================================================
// Afspraken toevoegen, aanpassen en verwijderen.
// Alles gaat direct naar Google Agenda; daarna halen we de week opnieuw op.
// =====================================================================

const TIJDZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const formulierEl = document.getElementById('formulier');
const veld = naam => document.getElementById('f-' + naam);

// Wat er in het formulier gebeurt:
//   soort 'nieuw' = nieuwe afspraak, 'los' = gewone afspraak aanpassen,
//   'keer' = één keer van een herhalende afspraak, 'reeks' = alle keren
let bewerking = null;

// ----- Hulpjes voor datums in het formulier -----
const tweeCijfers = n => String(n).padStart(2, '0');

function datumInvoer(d) {
  return `${d.getFullYear()}-${tweeCijfers(d.getMonth() + 1)}-${tweeCijfers(d.getDate())}`;
}

function tijdInvoer(d) {
  return `${tweeCijfers(d.getHours())}:${tweeCijfers(d.getMinutes())}`;
}

function uitInvoer(datum, tijd = '00:00') {
  const [jaar, maand, dag] = datum.split('-').map(Number);
  const [uur, minuut] = tijd.split(':').map(Number);
  return new Date(jaar, maand - 1, dag, uur, minuut);
}

// ----- Herhalingen: van keuzelijst naar Google-regel en terug -----
const HERHAAL_REGELS = {
  dagelijks: 'FREQ=DAILY',
  werkdagen: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  wekelijks: 'FREQ=WEEKLY',
  maandelijks: 'FREQ=MONTHLY',
  jaarlijks: 'FREQ=YEARLY',
};

function maakHerhaalRegel(herhaling, tot, heleDag) {
  const basis = HERHAAL_REGELS[herhaling];
  if (!basis) return null;
  const einde = tot ? `;UNTIL=${tot.replace(/-/g, '')}${heleDag ? '' : 'T235959Z'}` : '';
  return `RRULE:${basis}${einde}`;
}

// "RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z" → { herhaling: 'wekelijks', tot: '2026-12-31' }
function leesHerhaling(recurrence) {
  const regel = (recurrence || []).find(r => r.startsWith('RRULE:'));
  if (!regel) return { herhaling: 'geen', tot: '' };
  const delen = Object.fromEntries(regel.slice(6).split(';').map(d => d.split('=')));
  const tot = delen.UNTIL ? `${delen.UNTIL.slice(0, 4)}-${delen.UNTIL.slice(4, 6)}-${delen.UNTIL.slice(6, 8)}` : '';
  const extra = Object.keys(delen).filter(k => !['FREQ', 'UNTIL', 'WKST'].includes(k));
  const alleen = (...namen) => extra.every(k => namen.includes(k));

  let herhaling = 'anders'; // iets wat onze keuzelijst niet kent: laten we ongemoeid
  if (delen.COUNT || (delen.INTERVAL && delen.INTERVAL !== '1')) herhaling = 'anders';
  else if (delen.FREQ === 'DAILY' && alleen()) herhaling = 'dagelijks';
  else if (delen.FREQ === 'WEEKLY' && delen.BYDAY && delen.BYDAY.split(',').sort().join() === 'FR,MO,TH,TU,WE' && alleen('BYDAY')) herhaling = 'werkdagen';
  else if (delen.FREQ === 'WEEKLY' && alleen('BYDAY') && !(delen.BYDAY || '').includes(',')) herhaling = 'wekelijks';
  else if (delen.FREQ === 'MONTHLY' && alleen('BYMONTHDAY')) herhaling = 'maandelijks';
  else if (delen.FREQ === 'YEARLY' && alleen('BYMONTH', 'BYMONTHDAY')) herhaling = 'jaarlijks';
  return { herhaling, tot };
}

// ----- Vraagvenster (bijv. "Weet je het zeker?") -----
// knoppen: [{ label, waarde, soort }]; geeft de waarde van de gekozen knop, of null
function vraag(titel, tekst, knoppen) {
  const venster = document.getElementById('vraag');
  document.getElementById('vraag-titel').textContent = titel;
  document.getElementById('vraag-tekst').textContent = tekst;
  const rij = document.getElementById('vraag-knoppen');
  return new Promise(klaar => {
    let gekozen = null;
    rij.replaceChildren(...[{ label: 'Annuleren', waarde: null }, ...knoppen].map(k => {
      const knop = maak('button', `knop ${k.soort || ''}`);
      knop.textContent = k.label;
      knop.addEventListener('click', () => { gekozen = k.waarde; venster.close(); });
      return knop;
    }));
    venster.addEventListener('close', () => klaar(gekozen), { once: true });
    venster.showModal();
  });
}

// ----- Formulier vullen en uitlezen -----
function vulFormulier(w) {
  veld('titel').value = w.titel;
  veld('heledag').checked = w.heleDag;
  veld('startdatum').value = datumInvoer(w.start);
  veld('starttijd').value = tijdInvoer(w.start);
  veld('einddatum').value = datumInvoer(w.eind);
  veld('eindtijd').value = tijdInvoer(w.eind);
  veld('status').value = w.bezet ? 'bezet' : 'vrij';
  veld('herhaling').value = w.herhaling;
  veld('herhaling').querySelector('[value="anders"]').hidden = w.herhaling !== 'anders';
  veld('tot').value = w.tot;
  veld('locatie').value = w.locatie;
  veld('notitie').value = w.notitie;

  // alleen agenda's waar je in mag schrijven
  veld('agenda').replaceChildren(...agendas.filter(a => a.schrijfbaar).map(a => {
    const optie = maak('option');
    optie.value = a.id;
    optie.textContent = a.naam;
    optie.selected = a.id === w.agendaId;
    return optie;
  }));

  // bij "alleen deze keer" kun je de herhaling en de agenda niet wijzigen
  const eenKeer = bewerking.soort === 'keer';
  veld('herhaling').closest('.rij').hidden = eenKeer;
  veld('agenda').disabled = eenKeer;

  veld('melding').replaceChildren();
  werkZichtbaarheidBij();
  bewerking.beginwaarden = leesFormulier();
  bewerking.statusAangeraakt = false;
}

function leesFormulier() {
  return {
    titel: veld('titel').value.trim(),
    heleDag: veld('heledag').checked,
    startdatum: veld('startdatum').value,
    starttijd: veld('starttijd').value || '09:00',
    einddatum: veld('einddatum').value,
    eindtijd: veld('eindtijd').value || '10:00',
    agendaId: veld('agenda').value,
    bezet: veld('status').value === 'bezet',
    herhaling: veld('herhaling').value,
    tot: veld('tot').value,
    locatie: veld('locatie').value.trim(),
    notitie: veld('notitie').value,
  };
}

function werkZichtbaarheidBij() {
  const heleDag = veld('heledag').checked;
  for (const naam of ['starttijd', 'eindtijd']) veld(naam).closest('.tijdveld').hidden = heleDag;
  document.getElementById('f-tot-veld').hidden = veld('herhaling').value === 'geen';
}

// Begin en eind als Date, en het eind bij hele dagen als "dag erna" (zoals Google het wil)
function tijdenUit(w) {
  if (w.heleDag) {
    const start = uitInvoer(w.startdatum);
    return { start, eind: plusDagen(uitInvoer(w.einddatum), 1) };
  }
  return { start: uitInvoer(w.startdatum, w.starttijd), eind: uitInvoer(w.einddatum, w.eindtijd) };
}

// Een Date als Google-tijd; bij een wissel tussen "hele dag" en "met tijd" wissen we het andere veld
function googleTijd(d, heleDag) {
  return heleDag
    ? { date: datumInvoer(d), dateTime: null, timeZone: null }
    : { dateTime: `${datumInvoer(d)}T${tijdInvoer(d)}:00`, timeZone: TIJDZONE, date: null };
}

// Zonder de lege velden (voor een nieuwe afspraak)
function zonderLeeg(tijd) {
  return Object.fromEntries(Object.entries(tijd).filter(([, waarde]) => waarde !== null));
}

// ----- Formulier openen -----
function eersteHeleUur() {
  const nu = new Date();
  const dagen = zichtbareDagen();
  if (dagen.some(d => zelfdeDag(d, nu))) {
    const start = new Date(nu);
    start.setHours(nu.getHours() + 1, 0, 0, 0);
    return start;
  }
  const start = new Date(dagen[0]);
  start.setHours(9, 0, 0, 0);
  return start;
}

function hoofdagendaId() {
  const hoofd = agendas.find(a => a.primair && a.schrijfbaar) || agendas.find(a => a.schrijfbaar);
  return hoofd ? hoofd.id : '';
}

function nieuweAfspraak(start = eersteHeleUur(), heleDag = false) {
  bewerking = { soort: 'nieuw' };
  document.getElementById('formulier-titel').textContent = 'Nieuwe afspraak';
  vulFormulier({
    titel: '',
    heleDag,
    start,
    eind: heleDag ? start : new Date(start.getTime() + 60 * 60 * 1000),
    agendaId: hoofdagendaId(),
    bezet: !heleDag, // een hele dag is meestal een herinnering (vrij)
    herhaling: 'geen',
    tot: '',
    locatie: '',
    notitie: '',
  });
  formulierEl.showModal();
  veld('titel').focus();
}

async function bewerkAfspraak(afspraak) {
  document.getElementById('details').close();
  let soort = 'los';
  let reeks = null;
  if (afspraak.reeksId) {
    soort = await vraag('Herhalende afspraak', 'Wat wil je aanpassen?', [
      { label: 'Alleen deze keer', waarde: 'keer' },
      { label: 'Alle keren', waarde: 'reeks', soort: 'actief' },
    ]);
    if (!soort) return;
    if (soort === 'reeks') {
      try {
        reeks = await haalEenAfspraak(afspraak.agenda.id, afspraak.reeksId);
      } catch (fout) {
        meldFout(fout);
        return;
      }
    }
  }

  bewerking = { soort, afspraak, reeks };
  document.getElementById('formulier-titel').textContent =
    soort === 'keer' ? 'Deze keer aanpassen' : soort === 'reeks' ? 'Alle keren aanpassen' : 'Afspraak aanpassen';
  const bron = reeks
    ? { titel: reeks.summary || '', locatie: reeks.location || '', notitie: reeks.description || '', bezet: reeks.transparency !== 'transparent' }
    : { titel: afspraak.titel, locatie: afspraak.locatie, notitie: afspraak.notitie, bezet: afspraak.bezet };
  vulFormulier({
    ...bron,
    notitie: notitieAlsTekst(bron.notitie),
    heleDag: afspraak.heleDag,
    start: afspraak.start,
    eind: afspraak.heleDag ? plusDagen(afspraak.eind, -1) : afspraak.eind,
    agendaId: afspraak.agenda.id,
    ...(reeks ? leesHerhaling(reeks.recurrence) : { herhaling: 'geen', tot: '' }),
  });
  formulierEl.showModal();
}

// ----- Opslaan -----
async function slaOp() {
  const w = leesFormulier();
  const melding = veld('melding');
  melding.replaceChildren();
  if (!w.titel) return toonMelding('Vul een titel in.');
  if (!w.startdatum || !w.einddatum) return toonMelding('Vul een begin- en einddatum in.');
  const { start, eind } = tijdenUit(w);
  if (eind < start) return toonMelding('Het eind ligt vóór het begin.');

  const begin = bewerking.beginwaarden;
  const herhalingGewijzigd = w.herhaling !== begin.herhaling || w.tot !== begin.tot;
  const inhoud = {
    summary: w.titel,
    location: w.locatie,
    transparency: w.bezet ? 'opaque' : 'transparent',
  };
  // de notitie alleen meesturen als je hem echt hebt veranderd (zo blijft opmaak uit Google heel)
  if (w.notitie !== begin.notitie || bewerking.soort === 'nieuw') inhoud.description = w.notitie;

  const knop = veld('opslaan');
  knop.disabled = true;
  knop.textContent = 'Opslaan…';
  try {
    const { soort, afspraak, reeks } = bewerking;
    if (soort === 'nieuw') {
      const regel = maakHerhaalRegel(w.herhaling, w.tot, w.heleDag);
      await maakNieuweAfspraak(w.agendaId, {
        ...inhoud,
        start: zonderLeeg(googleTijd(start, w.heleDag)),
        end: zonderLeeg(googleTijd(eind, w.heleDag)),
        ...(regel ? { recurrence: [regel] } : {}),
      });
    } else if (soort === 'los' || soort === 'keer') {
      if (soort === 'los' && herhalingGewijzigd) {
        const regel = maakHerhaalRegel(w.herhaling, w.tot, w.heleDag);
        inhoud.recurrence = regel ? [regel] : [];
      }
      await wijzigAfspraak(afspraak.agenda.id, afspraak.id, {
        ...inhoud,
        start: googleTijd(start, w.heleDag),
        end: googleTijd(eind, w.heleDag),
      });
      if (soort === 'los' && w.agendaId !== afspraak.agenda.id) {
        await verplaatsAfspraak(afspraak.agenda.id, afspraak.id, w.agendaId);
      }
    } else if (soort === 'reeks') {
      // Verschuif de hele reeks net zoveel dagen als je deze keer hebt verschoven;
      // de tijd en duur komen uit het formulier
      const verschuiving = dagenTussen(afspraak.start, start);
      const reeksBegin = reeks.start.date ? leesDatum(reeks.start.date) : new Date(reeks.start.dateTime);
      const nieuwBegin = plusDagen(beginVanDag(reeksBegin), verschuiving);
      if (!w.heleDag) nieuwBegin.setHours(start.getHours(), start.getMinutes());
      const nieuwEind = w.heleDag
        ? plusDagen(nieuwBegin, dagenTussen(start, eind))
        : new Date(nieuwBegin.getTime() + (eind - start));
      inhoud.start = googleTijd(nieuwBegin, w.heleDag);
      inhoud.end = googleTijd(nieuwEind, w.heleDag);
      if (herhalingGewijzigd) {
        // uitzonderingen (EXDATE) houden we; alleen de herhaalregel zelf vervangen we
        const overig = (reeks.recurrence || []).filter(r => !r.startsWith('RRULE:'));
        const regel = maakHerhaalRegel(w.herhaling, w.tot, w.heleDag);
        inhoud.recurrence = regel ? [regel, ...overig] : [];
      }
      await wijzigAfspraak(afspraak.agenda.id, reeks.id, inhoud);
      if (w.agendaId !== afspraak.agenda.id) {
        await verplaatsAfspraak(afspraak.agenda.id, reeks.id, w.agendaId);
      }
    }

    formulierEl.close();
    // laat de week zien waarin de afspraak nu staat
    if (!zichtbareDagen().some(d => zelfdeDag(d, start))) staat.anker = beginVanDag(start);
    await laadPeriode({ opnieuw: true });
  } catch (fout) {
    if (fout instanceof NietIngelogdFout) {
      toonMelding('Je inlog is verlopen. ', 'Opnieuw inloggen', async () => {
        toonMelding(await opnieuwInloggen()
          ? 'Je bent weer ingelogd. Tik nog eens op Opslaan.'
          : 'Inloggen is niet gelukt. Probeer het nog eens.');
      });
    } else {
      toonMelding('Opslaan is niet gelukt: ' + fout.message);
    }
  } finally {
    knop.disabled = false;
    knop.textContent = 'Opslaan';
  }
}

function toonMelding(tekst, knopTekst, opKlik) {
  const melding = veld('melding');
  melding.replaceChildren(tekst);
  if (knopTekst) {
    const knop = maak('button', 'tekstknop');
    knop.type = 'button';
    knop.textContent = knopTekst;
    knop.addEventListener('click', opKlik);
    melding.append(knop);
  }
}

// ----- Verwijderen -----
async function verwijder(afspraak) {
  document.getElementById('details').close();
  let keuze;
  if (afspraak.reeksId) {
    keuze = await vraag('Herhalende afspraak verwijderen', `Wat wil je verwijderen van "${afspraak.titel}"?`, [
      { label: 'Alleen deze keer', waarde: 'keer', soort: 'gevaar' },
      { label: 'Alle keren', waarde: 'reeks', soort: 'gevaar' },
    ]);
  } else {
    keuze = await vraag('Afspraak verwijderen?', `"${afspraak.titel}" wordt verwijderd uit Google Agenda.`, [
      { label: 'Verwijderen', waarde: 'keer', soort: 'gevaar' },
    ]);
  }
  if (!keuze) return;
  try {
    await verwijderAfspraak(afspraak.agenda.id, keuze === 'reeks' ? afspraak.reeksId : afspraak.id);
    await laadPeriode({ opnieuw: true });
  } catch (fout) {
    meldFout(fout);
  }
}

function meldFout(fout) {
  if (fout instanceof NietIngelogdFout) {
    laadPeriode(); // toont de inlogknop
    zetStatus('Je inlog was verlopen. Log in en probeer het nog eens.', true);
  } else {
    zetStatus('Niet gelukt: ' + fout.message, true);
  }
}

// ----- Knoppen en velden -----
document.getElementById('nieuw').addEventListener('click', () => nieuweAfspraak());
document.getElementById('details-bewerken').addEventListener('click', () => bewerkAfspraak(getoondeAfspraak));
document.getElementById('details-verwijderen').addEventListener('click', () => verwijder(getoondeAfspraak));
document.getElementById('f-annuleren').addEventListener('click', () => formulierEl.close());
document.getElementById('afspraak-formulier').addEventListener('submit', e => {
  e.preventDefault();
  slaOp();
});

veld('heledag').addEventListener('change', () => {
  // bij een nieuwe afspraak: hele dag is standaard "vrij", met tijd "bezet"
  if (bewerking.soort === 'nieuw' && !bewerking.statusAangeraakt) {
    veld('status').value = veld('heledag').checked ? 'vrij' : 'bezet';
  }
  werkZichtbaarheidBij();
});
veld('status').addEventListener('change', () => { bewerking.statusAangeraakt = true; });
veld('herhaling').addEventListener('change', werkZichtbaarheidBij);

// Als je het begin verschuift, schuift het eind mee (de duur blijft gelijk)
let vorigBegin = null;
for (const naam of ['startdatum', 'starttijd']) {
  veld(naam).addEventListener('focus', () => {
    vorigBegin = uitInvoer(veld('startdatum').value, veld('starttijd').value || '00:00');
  });
  veld(naam).addEventListener('change', () => {
    if (!vorigBegin || !veld('startdatum').value) return;
    const nieuwBegin = uitInvoer(veld('startdatum').value, veld('starttijd').value || '00:00');
    const oudEind = uitInvoer(veld('einddatum').value, veld('eindtijd').value || '00:00');
    const nieuwEind = new Date(oudEind.getTime() + (nieuwBegin - vorigBegin));
    veld('einddatum').value = datumInvoer(nieuwEind);
    veld('eindtijd').value = tijdInvoer(nieuwEind);
    vorigBegin = nieuwBegin;
  });
}
