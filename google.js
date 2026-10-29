// =====================================================================
// Koppeling met Google Agenda: inloggen en afspraken ophalen.
// De app praat rechtstreeks met Google; er zit geen eigen server tussen.
// =====================================================================

// Openbare Client-ID uit Google Cloud (project "Mijn agenda").
// Niet geheim: hij werkt alleen vanaf https://sirloeki.github.io
const GOOGLE_CLIENT_ID = '754916975009-c4hdbul5qhs9uot7bi1qn09i8j2ih0fe.apps.googleusercontent.com';

// Toestemming om agenda's te lezen én (later) aan te passen
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar';
const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';

class NietIngelogdFout extends Error {}

// Google geeft een "toegangspas" (token) die ongeveer een uur geldig is.
// We bewaren hem op dit apparaat, zodat je niet bij elk openen opnieuw hoeft in te loggen.
let toegang = leesBewaardeToegang();

function leesBewaardeToegang() {
  try {
    const bewaard = JSON.parse(localStorage.getItem('googleToegang'));
    if (bewaard && bewaard.verlooptOp > Date.now()) return bewaard;
  } catch (e) { /* niets bewaard */ }
  return null;
}

function bewaarToegang(waarde) {
  try {
    if (waarde) localStorage.setItem('googleToegang', JSON.stringify(waarde));
    else localStorage.removeItem('googleToegang');
  } catch (e) { /* niet erg */ }
}

function isIngelogd() {
  // een minuut speling, zodat de pas niet halverwege een verzoek verloopt
  return !!toegang && toegang.verlooptOp > Date.now() + 60 * 1000;
}

// Het inlogscript van Google laadt los van de app; wacht tot het klaar is
function wachtOpGoogleScript() {
  return new Promise((resolve, reject) => {
    const begin = Date.now();
    (function kijk() {
      if (window.google && google.accounts && google.accounts.oauth2) resolve();
      else if (Date.now() - begin > 10000) reject(new Error('Het inlogscript van Google laadt niet. Heb je internet?'));
      else setTimeout(kijk, 100);
    })();
  });
}

// Opent het inlogvenster van Google
async function logIn() {
  await wachtOpGoogleScript();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      callback: antwoord => {
        if (antwoord.error) {
          reject(new Error(antwoord.error_description || antwoord.error));
          return;
        }
        toegang = {
          token: antwoord.access_token,
          verlooptOp: Date.now() + Number(antwoord.expires_in) * 1000,
        };
        bewaarToegang(toegang);
        resolve();
      },
      error_callback: fout => {
        reject(new Error(fout.type === 'popup_closed' ? 'Inloggen afgebroken.' : 'Inloggen is niet gelukt.'));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

function logUit() {
  toegang = null;
  bewaarToegang(null);
}

// Een foutmelding van Google, met het statusnummer erbij (bijv. 409 = bestaat al)
class GoogleFout extends Error {
  constructor(status, bericht, reden) {
    super(bericht);
    this.status = status;
    this.reden = reden;
  }
}

// Eén verzoek aan de Google Agenda-API.
// Zonder 'methode' is het een opvraag (GET); met 'inhoud' sturen we gegevens mee.
async function googleVraag(pad, parameters = {}, { methode = 'GET', inhoud } = {}) {
  if (!isIngelogd()) throw new NietIngelogdFout();
  const url = new URL(GOOGLE_API + pad);
  for (const [sleutel, waarde] of Object.entries(parameters)) url.searchParams.set(sleutel, waarde);

  const opties = { method: methode, headers: { Authorization: `Bearer ${toegang.token}` } };
  if (inhoud !== undefined) {
    opties.headers['Content-Type'] = 'application/json';
    opties.body = JSON.stringify(inhoud);
  }
  const antwoord = await fetch(url, opties);
  if (antwoord.status === 401) {
    logUit();
    throw new NietIngelogdFout();
  }
  if (!antwoord.ok) {
    let bericht = `Google gaf een foutmelding (${antwoord.status}).`;
    let reden = '';
    try {
      const fout = (await antwoord.json()).error;
      if (fout && fout.message) bericht = `${fout.message} (${antwoord.status})`;
      reden = fout?.errors?.[0]?.reason || '';
    } catch (e) { /* geen uitleg meegestuurd */ }
    throw new GoogleFout(antwoord.status, bericht, reden);
  }
  return antwoord.status === 204 ? null : antwoord.json();
}

// De agenda's die in Google Agenda aangevinkt staan
async function haalAgendas() {
  const lijst = await googleVraag('/users/me/calendarList');
  return lijst.items
    .filter(item => item.selected || item.primary)
    .map(item => ({
      id: item.id,
      naam: item.summaryOverride || item.summary,
      kleur: item.backgroundColor,
      tekstkleur: item.foregroundColor || '#ffffff',
      primair: !!item.primary,
    }))
    .sort((a, b) => b.primair - a.primair || a.naam.localeCompare(b.naam));
}

// Alle afspraken van de gegeven agenda's tussen 'van' en 'tot'
async function haalAfspraken(agendas, van, tot) {
  const perAgenda = await Promise.all(agendas.map(async agenda => {
    const items = [];
    let paginaToken;
    do {
      const pagina = await googleVraag(`/calendars/${encodeURIComponent(agenda.id)}/events`, {
        timeMin: van.toISOString(),
        timeMax: tot.toISOString(),
        singleEvents: 'true', // herhalende afspraken als losse afspraken
        maxResults: '2500',
        ...(paginaToken ? { pageToken: paginaToken } : {}),
      });
      items.push(...pagina.items);
      paginaToken = pagina.nextPageToken;
    } while (paginaToken);

    return items
      .filter(item => item.status !== 'cancelled' && item.start)
      .map(item => naarAfspraak(item, agenda));
  }));
  return perAgenda.flat();
}

// Zet een afspraak van Google om naar het formaat van onze app
function naarAfspraak(item, agenda) {
  const heleDag = !!item.start.date;
  return {
    id: item.id,
    titel: item.summary || '(geen titel)',
    start: heleDag ? leesDatum(item.start.date) : new Date(item.start.dateTime),
    eind: heleDag ? leesDatum(item.end.date) : new Date(item.end.dateTime),
    heleDag,
    locatie: item.location || '',
    // "Bezet" of "Beschikbaar" (vrij); Google noemt vrij 'transparent'
    bezet: item.transparency !== 'transparent',
    agenda,
  };
}

// "2026-10-23" → 23 oktober 2026, 00:00 in je eigen tijdzone
function leesDatum(tekst) {
  const [jaar, maand, dag] = tekst.split('-').map(Number);
  return new Date(jaar, maand - 1, dag);
}
