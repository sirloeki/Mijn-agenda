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
