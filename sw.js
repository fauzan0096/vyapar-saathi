'use strict';

/* Vyapar Saathi — offline shell (v3).
   Network pehle (taaki naya code turant mile), internet na ho to cache se.
   Purana cache activate par saaf ho jaata hai. */

var CACHE = 'vyapar-saathi-v8';
var ASSETS = ['./', 'index.html', 'guide.html', 'statement.html', 'app.css', 'core.js', 'engine.js',
  'importer.js', 'views.js', 'money.js', 'main.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'favicon.png', 'apple-touch-icon.png', 'xlsx.full.min.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (u) {
      return c.add(u).catch(function () { /* file na mile to chhod dein */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') { return; }
  e.respondWith(
    fetch(e.request).then(function (r) {
      if (r && r.ok) {
        var cp = r.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, cp); }).catch(function () {});
      }
      return r;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('index.html');
      });
    })
  );
});
