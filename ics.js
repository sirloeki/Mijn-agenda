// =====================================================================
// Leest een .ics-agendabestand (zoals Outlook dat exporteert).
// Het bestand wordt stukje voor stukje gelezen, zodat ook een heel groot
// bestand past. Bijlagen en opgemaakte (HTML-)teksten slaan we over:
// die maken het bestand groot en hebben we niet nodig.
// =====================================================================

// Eigenschappen die we niet bewaren
const OVERSLAAN = new Set(['ATTACH', 'X-ALT-DESC', 'X-MS-OLK-ORIGINALSTART', 'X-MS-OLK-ORIGINALEND']);

// Leest het bestand en geeft een lijst met afspraken terug.
// opVoortgang(fractie) wordt tussendoor aangeroepen (0 tot 1).
async function leesIcs(bestand, opVoortgang = () => {}) {
  const afspraken = [];
  const stapel = [];        // in welk onderdeel we zitten, bijv. VCALENDAR > VEVENT > VALARM
  let afspraak = null;
  let regel = null;         // de huidige (samengevoegde) regel
  let regelOverslaan = false;
  let bijlagen = 0;

  function verwerkRegel(tekst) {
    const eigenschap = leesEigenschap(tekst);
    if (!eigenschap) return;
    const { naam, parameters, waarde } = eigenschap;

    if (naam === 'BEGIN') {
      stapel.push(waarde);
      if (waarde === 'VEVENT' && stapel.length === 2) afspraak = { eigenschappen: {}, bijlagen: 0 };
      return;
    }
    if (naam === 'END') {
      if (waarde === 'VEVENT' && afspraak && stapel.length === 2) {
        afspraken.push(afspraak);
        afspraak = null;
      }
      stapel.pop();
      return;
    }
    // Alleen eigenschappen die direct bij de afspraak horen (niet bij een herinnering)
    if (!afspraak || stapel.length !== 2) return;
    (afspraak.eigenschappen[naam] ||= []).push({ parameters, waarde });
  }

  function regelKlaar() {
    if (regel !== null && !regelOverslaan) verwerkRegel(regel);
    regel = null;
  }

  function nieuweRegel(tekst) {
    if (tekst.startsWith(' ') || tekst.startsWith('\t')) {
      // vervolg van de vorige regel (lange regels worden in .ics afgebroken)
      if (!regelOverslaan && regel !== null) regel += tekst.slice(1);
      return;
    }
    regelKlaar();
    const naam = tekst.split(/[;:]/, 1)[0].toUpperCase();
    regelOverslaan = OVERSLAAN.has(naam);
    if (naam === 'ATTACH' && afspraak) {
      afspraak.bijlagen++;
      bijlagen++;
    }
    regel = regelOverslaan ? null : tekst;
  }

  const lezer = bestand.stream().pipeThrough(new TextDecoderStream()).getReader();
  let rest = '';
  let gelezen = 0;
  for (;;) {
    const { value, done } = await lezer.read();
    if (done) break;
    gelezen += value.length;
    rest += value;
    const regels = rest.split(/\r?\n/);
    rest = regels.pop();
    for (const r of regels) nieuweRegel(r);
    opVoortgang(Math.min(1, gelezen / bestand.size));
  }
  if (rest) nieuweRegel(rest);
  regelKlaar();
  opVoortgang(1);

  return { afspraken: afspraken.map(maakAfspraak), bijlagen };
}

// "DTSTART;TZID=W. Europe Standard Time:20250101T090000"
//   → { naam: 'DTSTART', parameters: { TZID: 'W. Europe Standard Time' }, waarde: '20250101T090000' }
function leesEigenschap(tekst) {
  let inAanhaling = false;
  let dubbelepunt = -1;
  for (let i = 0; i < tekst.length; i++) {
    const teken = tekst[i];
    if (teken === '"') inAanhaling = !inAanhaling;
    else if (teken === ':' && !inAanhaling) { dubbelepunt = i; break; }
  }
  if (dubbelepunt === -1) return null;

  const [naam, ...delen] = tekst.slice(0, dubbelepunt).split(';');
  const parameters = {};
  for (const deel of delen) {
    const is = deel.indexOf('=');
    if (is > 0) parameters[deel.slice(0, is).toUpperCase()] = deel.slice(is + 1).replace(/^"|"$/g, '');
  }
  return { naam: naam.toUpperCase(), parameters, waarde: tekst.slice(dubbelepunt + 1) };
}

// Tekst in .ics is "ge-escaped": \n is een nieuwe regel, \, is een komma, enz.
function leesTekst(waarde) {
  return waarde.replace(/\\([\\;,nN])/g, (_, teken) => (teken === 'n' || teken === 'N' ? '\n' : teken));
}

// Zet de ruwe eigenschappen om naar een handzaam object
function maakAfspraak(ruw) {
  const e = ruw.eigenschappen;
  const eerste = naam => (e[naam] ? e[naam][0] : null);

  const categorieen = (e.CATEGORIES || [])
    .flatMap(c => c.waarde.split(/(?<!\\),/))
    .map(c => leesTekst(c).trim())
    .filter(Boolean);

  const start = eerste('DTSTART');
  return {
    uid: eerste('UID')?.waarde || '',
    titel: eerste('SUMMARY') ? leesTekst(eerste('SUMMARY').waarde) : '',
    start,                                   // { parameters, waarde }
    eind: eerste('DTEND'),
    duur: eerste('DURATION')?.waarde || null,
    jaar: start ? Number(start.waarde.slice(0, 4)) : null,
    categorieen,
    herhaling: eerste('RRULE')?.waarde || null,
    uitzondering: !!eerste('RECURRENCE-ID'), // één aangepaste keer uit een herhalende reeks
    bijlagen: ruw.bijlagen,
    eigenschappen: e,                        // alles, voor ronde 2
  };
}

// Loopt een herhalende reeks nog door (of eindigt hij in de toekomst)?
function reeksLooptNog(afspraak, vandaag) {
  if (!afspraak.herhaling) return false;
  const tot = /UNTIL=(\d{8})/.exec(afspraak.herhaling);
  if (tot) return tot[1] >= vandaag;
  return !/COUNT=/.test(afspraak.herhaling); // zonder einddatum en zonder aantal: loopt altijd door
}
