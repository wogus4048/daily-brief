import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
export async function serve() {
  const root=resolve('.');
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
  const server=createServer(async(req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root+sep)) {res.writeHead(403).end();return;}
      const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
    } catch {res.writeHead(404).end('Not found');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {base:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>server.close(r))};
}
export const launchOptions={headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})};
export async function ready(page) {
  await page.waitForFunction(()=>(document.body.dataset.page === ((location.hash === "#/" || location.hash === "#" || !location.hash) ? "home" : location.hash.split("/").length > 2 ? "detail" : location.hash.slice(2))));
  await page.waitForFunction(()=>[...document.querySelectorAll('ion-item,ion-card,ion-list,ion-searchbar,ion-select,ion-icon,ion-segment')].every(e=>e.classList.contains('hydrated')));
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
