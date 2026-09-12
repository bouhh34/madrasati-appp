const CACHE="ma-madrassa-v4-shell-1";
const SHELL=["/","/index.html","/app.css","/app.js","/manifest.webmanifest","/assets/official-logo.png","/assets/mauritania-school.webp"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{const u=new URL(event.request.url);if(u.origin!==self.location.origin)return;if(u.pathname.startsWith("/api/"))return;if(event.request.method!=="GET")return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{if(!r||!r.ok)return r;const clone=r.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));return r}).catch(()=>caches.match("/index.html"))))});
