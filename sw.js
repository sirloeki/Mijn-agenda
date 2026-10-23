// =====================================================================
// Service worker: zorgt dat de app installeerbaar is en ook zonder
// internet opent. Eerst proberen we altijd de nieuwste versie van
// internet te halen; lukt dat niet, dan gebruiken we de bewaarde kopie.
// =====================================================================

const CACHE = 'mijn-agenda-v5';
const BESTANDEN = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './google.js',
  './ics.js',
  './importeren.html',
  './importeren.js',
  './manifest.webmanifest',
  './iconen/icoon.svg',
  './iconen/icoon-192.png',
  './iconen/icoon-512.png',
];

// Bij installeren: de basisbestanden alvast bewaren
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(BESTANDEN)));
  self.skipWaiting();
});

// Oude bewaarde versies opruimen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(namen => Promise.all(
      namen.filter(naam => naam !== CACHE).map(naam => caches.delete(naam))
    ))
  );
  self.clients.claim();
});

// Alleen bestanden van de app zelf; verzoeken naar bijv. Google gaan er gewoon langs
self.addEventListener('fetch', event => {
  const verzoek = event.request;
  if (verzoek.method !== 'GET' || new URL(verzoek.url).origin !== location.origin) return;

  event.respondWith(
    fetch(verzoek)
      .then(antwoord => {
        const kopie = antwoord.clone();
        caches.open(CACHE).then(cache => cache.put(verzoek, kopie));
        return antwoord;
      })
      .catch(() => caches.match(verzoek, { ignoreSearch: true }))
  );
});
