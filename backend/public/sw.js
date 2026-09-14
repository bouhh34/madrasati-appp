const CACHE = "ma-madrassa-v4-shell-8";
const STATIC_FILES = ["/app.css","/features.css","/app.js","/structure.js","/platform-navigation.js","/manifest.webmanifest","/assets/official-logo.png","/assets/mauritania-school.webp"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC_FILES)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("ma-madrassa-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(url.origin!==self.location.origin||request.method!=="GET")return;
  if(url.pathname.startsWith("/api/"))return;
  // Verification pages contain student records and must never enter offline storage.
  if(!STATIC_FILES.includes(url.pathname))return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}
    return response;
  }).catch(()=>caches.match(request)));
});
