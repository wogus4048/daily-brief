import { chromium } from 'playwright';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { serve,launchOptions,ready } from './ui_helpers.mjs';
const folder=process.argv[2]||'artifacts/ui-final';
await mkdir(folder,{recursive:true});
const host=await serve();const browser=await chromium.launch(launchOptions);
const page=await browser.newPage();
const data=JSON.parse(await readFile('data/latest.json','utf8'));
const detail=data.support.find(x=>x.status!=='CLOSED');
const routes=[['home','#/'],['ai-news','#/ai-news'],['discovery','#/ai-discovery'],['contests','#/contests'],['support','#/support'],['detail','#/support/'+encodeURIComponent(detail.id)]];
const sizes=[[1920,1080],[1440,900],[1280,800]];
const report=[];
try {
 for(const [width,height] of sizes) {
  await page.setViewportSize({width,height});
  for(const [name,hash] of routes) {
   await page.goto(host.base+'/'+hash);await ready(page);
   await page.waitForFunction(()=>[...document.querySelectorAll(".github-metrics")].every(node=>!node.textContent.includes("불러오는 중")));
   await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200);
   await page.screenshot({path:`${folder}/${name}-${width}x${height}.png`});
   report.push({page:name,width,height,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  }
  console.log(`Captured six routes at ${width}×${height}`);
 }
 await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));
 await writeFile(`${folder}/index.html`,`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Brief UI 검토</title><style>body{margin:40px;font:16px/1.6 system-ui,sans-serif;color:#20252b;background:#fff}h1{font-size:32px}nav{display:flex;gap:24px}a{color:#2457d6}section{margin:48px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0}img{width:100%;border:1px solid #dfe3e8}figcaption{padding:10px 0} @media(max-width:800px){.grid{grid-template-columns:1fr}}</style><h1>Daily Brief · UI 검토</h1><p>실제 데이터로 렌더링한 최종 화면. 이미지를 선택하면 원본 크기로 열립니다.</p><nav>${sizes.map(([w,h])=>`<a href="#size-${w}">${w}×${h}</a>`).join('')}</nav>${sizes.map(([w,h])=>`<section id="size-${w}"><h2>${w}×${h}</h2><div class="grid">${routes.map(([n])=>`<figure><a href="${n}-${w}x${h}.png"><img src="${n}-${w}x${h}.png" loading="lazy" alt="${n} ${w}×${h}"></a><figcaption>${n}</figcaption></figure>`).join('')}</div></section>`).join('')}</html>`);
} finally {await browser.close();await host.close();}
