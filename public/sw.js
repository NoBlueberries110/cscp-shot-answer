// public/sw.js
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('shot-answer-v1').then(cache => cache.addAll([
      '/', '/index.html', '/style.css', '/script.js', '/manifest.json',
      '/icon-192.png', '/icon-512.png'
    ]))
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});
