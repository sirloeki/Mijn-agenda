// =====================================================================
// Zet afspraken uit het .ics-bestand om naar het formaat van Google Agenda.
// =====================================================================

const STANDAARD_TIJDZONE = 'Europe/Amsterdam';

// Outlook gebruikt Windows-namen voor tijdzones; Google wil de internationale namen
const WINDOWS_TIJDZONES = {
  'W. Europe Standard Time': 'Europe/Amsterdam',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'UTC': 'UTC',
  'Coordinated Universal Time': 'UTC',
  'GTB Standard Time': 'Europe/Athens',
  'FLE Standard Time': 'Europe/Helsinki',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Russian Standard Time': 'Europe/Moscow',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Arabian Standard Time': 'Asia/Dubai',
  'Arab Standard Time': 'Asia/Riyadh',
  'India Standard Time': 'Asia/Kolkata',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'Singapore Standard Time': 'Asia/Singapore',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Egypt Standard Time': 'Africa/Cairo',
  'Morocco Standard Time': 'Africa/Casablanca',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Atlantic Standard Time': 'America/Halifax',
  'SA Pacific Standard Time': 'America/Bogota',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Mexico Standard Time': 'America/Mexico_City',
};

const onbekendeTijdzones = new Set();

function tijdzoneNaam(tzid) {
  if (!tzid) return STANDAARD_TIJDZONE;
  const schoon = tzid.replace(/^\//, '');
  if (WINDOWS_TIJDZONES[schoon]) return WINDOWS_TIJDZONES[schoon];
  if (schoon.includes('/')) return schoon; // is al een internationale naam
  onbekendeTijdzones.add(schoon);
  return STANDAARD_TIJDZONE;
}

// ----- Datums en tijden -----
function isDatum(eigenschap) {
  return eigenschap.parameters.VALUE === 'DATE' || /^\d{8}$/.test(eigenschap.waarde);
}

// "20260105" → "2026-01-05"
function datumTekst(w) {
  return `${w.slice(0, 4)}-${w.slice(4, 6)}-${w.slice(6, 8)}`;
}

// "20260105T093000" → "2026-01-05T09:30:00"
function tijdTekst(w) {
  return `${datumTekst(w)}T${w.slice(9, 11)}:${w.slice(11, 13)}:${w.slice(13, 15)}`;
}

// Een DTSTART/DTEND/RECURRENCE-ID omzetten naar Google: { date } of { dateTime, timeZone }
function naarGoogleTijd(eigenschap) {
  const w = eigenschap.waarde;
  if (isDatum(eigenschap)) return { date: datumTekst(w) };
  if (w.endsWith('Z')) return { dateTime: tijdTekst(w) + 'Z', timeZone: STANDAARD_TIJDZONE };
  return { dateTime: tijdTekst(w), timeZone: tijdzoneNaam(eigenschap.parameters.TZID) };
}

// Hoeveel milliseconden loopt tijdzone 'tz' voor op UTC, op moment 'ms'?
function tijdzoneVerschil(ms, tz) {
  const delen = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const d = Object.fromEntries(delen.map(p => [p.type, p.value]));
  return Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute, d.second) - ms;
}

// Een Google-tijd ({ dateTime, timeZone }) als echt moment (Date)
function alsMoment(tijd) {
  if (/Z$|[+-]\d\d:\d\d$/.test(tijd.dateTime)) return new Date(tijd.dateTime);
  const alsUtc = Date.parse(tijd.dateTime + 'Z');
  let moment = alsUtc - tijdzoneVerschil(alsUtc, tijd.timeZone);
  moment = alsUtc - tijdzoneVerschil(moment, tijd.timeZone); // nog eens, voor de wissel zomer/wintertijd
  return new Date(moment);
}

// Datum "2026-01-05" + aantal dagen
function datumPlus(tekst, dagen) {
  const d = new Date(tekst + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

// "PT1H30M" / "P1D" → milliseconden
function duurInMs(duur) {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duur || '');
  if (!m) return null;
  const [, w = 0, d = 0, u = 0, min = 0, s = 0] = m.map(x => Number(x || 0));
  return ((((w * 7 + d) * 24 + u) * 60 + min) * 60 + s) * 1000;
}

// Begin en eind van een afspraak, met verbeteringen voor ontbrekende of onlogische waarden
function beginEnEind(afspraak) {
  const start = naarGoogleTijd(afspraak.start);
  let eind = afspraak.eind ? naarGoogleTijd(afspraak.eind) : null;

  if (start.date) {
    if (!eind || !eind.date || eind.date <= start.date) {
      const dagen = Math.max(1, Math.round((duurInMs(afspraak.duur) || 0) / 86400000));
      eind = { date: datumPlus(start.date, dagen) };
    }
    return { start, eind };
  }

  const duur = duurInMs(afspraak.duur);
  if (!eind || eind.date) {
    eind = { dateTime: new Date(alsMoment(start).getTime() + (duur ?? 0)).toISOString(), timeZone: start.timeZone };
  } else if (alsMoment(eind) < alsMoment(start)) {
    eind = { ...start };
  }
  return { start, eind };
}

// ----- Herhalingen -----
function herhaalRegels(afspraak) {
  const e = afspraak.eigenschappen;
  const regels = [];
  const startIsDatum = isDatum(afspraak.start);

  for (const r of e.RRULE || []) {
    // Bij afspraken met een tijd wil Google de einddatum (UNTIL) in UTC-tijd
    let regel = r.waarde.replace(/UNTIL=(\d{8})(?!T)/, (_, d) => (startIsDatum ? `UNTIL=${d}` : `UNTIL=${d}T235959Z`));
    regels.push('RRULE:' + regel);
  }
  for (const x of e.EXDATE || []) {
    if (isDatum(x)) regels.push(`EXDATE;VALUE=DATE:${x.waarde}`);
    else if (x.waarde.includes('Z')) regels.push(`EXDATE:${x.waarde}`);
    else regels.push(`EXDATE;TZID=${tijdzoneNaam(x.parameters.TZID)}:${x.waarde}`);
  }
  return regels;
}

// ----- Unieke en vaste ID per afspraak -----
// Zo kan het overzetten veilig opnieuw worden gestart: wat al in Google staat, wordt overgeslagen.
async function vasteId(tekst) {
  const bytes = new TextEncoder().encode(tekst);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  // Google staat alleen 0-9 en a-v toe; hexadecimaal (0-9, a-f) past daarin
  return 'ol' + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ----- De afspraak zelf -----
function eersteTekst(afspraak, naam) {
  const waarde = afspraak.eigenschappen[naam]?.[0]?.waarde;
  return waarde ? leesTekst(waarde) : '';
}

function naarGoogleAfspraak(afspraak) {
  const { start, eind } = beginEnEind(afspraak);
  const omschrijving = eersteTekst(afspraak, 'DESCRIPTION').trim();
  const google = {
    summary: afspraak.titel || '(geen titel)',
    start,
    end: eind,
    reminders: { useDefault: false, overrides: [] }, // geen herinneringen voor geïmporteerde afspraken
  };
  const locatie = eersteTekst(afspraak, 'LOCATION').trim();
  if (locatie) google.location = locatie.slice(0, 1000);
  if (omschrijving) google.description = omschrijving.length > 4000 ? omschrijving.slice(0, 4000) + '…' : omschrijving;
  if (eersteTekst(afspraak, 'TRANSP').toUpperCase() === 'TRANSPARENT') google.transparency = 'transparent';
  if (['PRIVATE', 'CONFIDENTIAL'].includes(eersteTekst(afspraak, 'CLASS').toUpperCase())) google.visibility = 'private';
  if (eersteTekst(afspraak, 'STATUS').toUpperCase() === 'CANCELLED') google.status = 'cancelled';
  const regels = herhaalRegels(afspraak);
  if (regels.length) google.recurrence = regels;
  return google;
}

// ID van één keer uit een herhalende reeks, zoals Google die maakt:
// <id van de reeks>_<oorspronkelijke begintijd in UTC>, bijv. ..._20260105T080000Z
function idVanKeer(reeksId, herhalingsId) {
  if (isDatum(herhalingsId)) return `${reeksId}_${herhalingsId.waarde.slice(0, 8)}`;
  const moment = alsMoment(naarGoogleTijd(herhalingsId));
  return `${reeksId}_${moment.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
}
