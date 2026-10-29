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

// Met welk Google-account je de vorige keer inlogde (je e-mailadres).
// Zo hoeft Google niet steeds te vragen welk account je wilt gebruiken.
function leesAccount() {
  try { return localStorage.getItem('googleAccount') || ''; } catch (e) { return ''; }
}

function bewaarAccount(email) {
  try {
    if (email) localStorage.setItem('googleAccount', email);
    else localStorage.removeItem('googleAccount');
  } catch (e) { /* niet erg */ }
}

// Was je eerder ingelogd (en niet zelf uitgelogd)? Dan mag de app vanzelf opnieuw inloggen.
function eerderIngelogd() {
  return !!leesAccount();
}

// Opent het inlogvenster van Google. Heb je eerder toestemming gegeven,
// dan sluit het venster meestal vanzelf weer.
async function logIn() {
  await wachtOpGoogleScript();
  return new Promise((resolve, reject) => {
    const account = leesAccount();
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      ...(account ? { login_hint: account } : {}),
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

// Toegang vergeten. Met 'helemaal' (de knop Uitloggen) vergeten we ook je account,
// zodat de app niet meer vanzelf opnieuw inlogt.
function logUit({ helemaal = false } = {}) {
  toegang = null;
  bewaarToegang(null);
  if (helemaal) bewaarAccount('');
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
  // de hoofdagenda heeft je e-mailadres als ID
  const hoofd = lijst.items.find(item => item.primary);
  if (hoofd) bewaarAccount(hoofd.id);
  return lijst.items
    .filter(item => item.selected || item.primary)
    .map(item => ({
      id: item.id,
      naam: item.summaryOverride || item.summary,
      kleur: item.backgroundColor,
      tekstkleur: item.foregroundColor || '#ffffff',
      primair: !!item.primary,
      // mag je er afspraken in zetten? (bij "Feestdagen in Nederland" bijvoorbeeld niet)
      schrijfbaar: item.accessRole === 'owner' || item.accessRole === 'writer',
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
    notitie: item.description || '',
    reeksId: item.recurringEventId || null, // hoort bij een herhalende afspraak
    agenda,
  };
}

// "2026-10-23" → 23 oktober 2026, 00:00 in je eigen tijdzone
function leesDatum(tekst) {
  const [jaar, maand, dag] = tekst.split('-').map(Number);
  return new Date(jaar, maand - 1, dag);
}

// ----- Afspraken toevoegen, aanpassen en verwijderen -----
// 'sendUpdates: none': er gaan nooit e-mails of uitnodigingen naar anderen

function afspraakPad(agendaId, afspraakId = '') {
  return `/calendars/${encodeURIComponent(agendaId)}/events${afspraakId ? '/' + encodeURIComponent(afspraakId) : ''}`;
}

function haalEenAfspraak(agendaId, afspraakId) {
  return googleVraag(afspraakPad(agendaId, afspraakId));
}

function maakNieuweAfspraak(agendaId, inhoud) {
  return googleVraag(afspraakPad(agendaId), { sendUpdates: 'none' }, { methode: 'POST', inhoud });
}

function wijzigAfspraak(agendaId, afspraakId, inhoud) {
  return googleVraag(afspraakPad(agendaId, afspraakId), { sendUpdates: 'none' }, { methode: 'PATCH', inhoud });
}

function verplaatsAfspraak(agendaId, afspraakId, naarAgendaId) {
  return googleVraag(`${afspraakPad(agendaId, afspraakId)}/move`,
    { destination: naarAgendaId, sendUpdates: 'none' }, { methode: 'POST' });
}

function verwijderAfspraak(agendaId, afspraakId) {
  return googleVraag(afspraakPad(agendaId, afspraakId), { sendUpdates: 'none' }, { methode: 'DELETE' });
}
