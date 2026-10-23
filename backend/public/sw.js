const CACHE = "ma-madrassa-v4-shell-13";
const STATIC_FILES = ["/app.css","/features.css","/app.js","/structure.js","/platform-navigation.js","/academic-workflows.js","/workflows.css","/attendance-workflows.js","/print-actions.js","/report-print.js","/report-print.css","/manifest.webmanifest","/assets/official-logo.png","/assets/mauritania-school.webp"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC_FILES)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("ma-madrassa-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(url.origin!==self.location.origin||request.method!=="GET")return;
  // Never cache authentication, student data, results, or verified report pages.
  if(url.pathname.startsWith("/api/"))return;
  if(!STATIC_FILES.includes(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    // Versioned static assets are immutable within a release. A version change
    // causes a fresh request, while repeat visits avoid downloading every file.
    const versioned=url.searchParams.has("v");
    if(versioned){
      const cached=await cache.match(request);
      if(cached)return cached;
    }
    try{
      const response=await fetch(request);
      if(response.ok)event.waitUntil(cache.put(request,response.clone()));
      return response;
    }catch(error){
      const fallback=await cache.match(request);
      if(fallback)return fallback;
      throw error;
    }
  })());
});
