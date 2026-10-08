import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serve,launchOptions,ready } from './ui_helpers.mjs';
const host=await serve();
const browser=await chromium.launch(launchOptions);
const page=await browser.newPage();
await page.route('https://api.github.com/repos/**',r=>r.fulfill({json:{stargazers_count:1234,forks_count:10}}));
const data=JSON.parse(await readFile('data/latest.json','utf8'));
const all=[...data.contests,...data.aiNews,...data.aiDiscovery,...data.support];
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const ids=selector=>page.locator(selector).evaluateAll(es=>es.map(e=>e.dataset.id));
async function go(route){await page.goto(host.base+'/'+route);await ready(page);}
try {
 for (const [width,height] of [[1920,1080],[1440,900],[1280,800]]) {
  await page.setViewportSize({width,height});
  for(const route of ['#/','#/ai-news','#/ai-discovery','#/contests','#/support','#/archive']) {
   await go(route);
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} must not overflow at ${width}`);
   const frame=await page.locator('.workspace').boundingBox();
   check(Math.abs(frame.width-1240)<=1 && Math.abs(frame.x-(width-frame.width)/2)<=1,`${route} uses the centered 1240px page frame at ${width}`);
   const aligned=await page.locator('.header-row, .main-nav, main, footer').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,width:r.width};}));
   check(aligned.every(r=>Math.abs(r.x-aligned[0].x)<1 && Math.abs(r.width-aligned[0].width)<1),'Header, navigation, main and footer share content edges');
   check(await page.locator('.view:not([hidden])').count()===1,'Exactly one route is displayed');
   check(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size;}),'No duplicate IDs');
   if(route==='#/') {
    const title=await page.locator('.product-title-line h3').first().boundingBox();
    const body=await page.locator('.product-body').first().boundingBox();
    const row=await page.locator('.product-row').first().boundingBox();
    check(body.width>=250 && title.width>=80 && title.x>=row.x && title.x+title.width<=row.x+row.width+1,'Home title fits inside its clickable row');
   }
   if(route==='#/ai-news') {
    const title=await page.locator('.category-item-title').first().boundingBox();
    check(title.width>=400,'News title does not collapse into a narrow column');
   }
   if(['#/contests','#/support'].includes(route)) {
    const boxes=await page.locator('.opportunity-card-v2').evaluateAll(es=>es.slice(0,4).map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width})));
    check(boxes[0].y===boxes[1].y&&boxes[2].y>boxes[0].y&&boxes[2].y===boxes[3].y&&boxes[0].w>500,'Two readable opportunity cards per desktop row');
   }
  }
 }
 await page.setViewportSize({width:1440,height:900});
 await go('#/');
 check(await page.locator('#homeSort').count()===0,'Daily summary has no arbitrary sort control');
 const newIds=await ids('[data-briefing-section="new"] [data-id]');
 check(newIds.length>0 && newIds.every(id=>all.find(i=>i.id===id).firstSeenDate===data.date),'New summary uses snapshot date');
 check(await page.locator('.briefing-section').count()===3,'Home has new, updated and closing sections');
 await page.locator('#searchButton').click();
 check(await page.locator('#searchDialog').evaluate(e=>e.open),'Search opens');
 const searchTitle=data.contests[0].title;
 await page.locator('#searchInput input').fill(searchTitle);
 await page.waitForSelector('.search-result');
 check((await page.locator('.search-result').first().textContent()).includes(searchTitle),'Search returns actual JSON content');
 await page.locator('.search-result').first().focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.body.dataset.page==='detail');
 check((await page.locator('#detailHeader h1').textContent()).includes(searchTitle),'Search result supports keyboard detail navigation');
 await page.keyboard.press('Control+k');
 check(await page.locator('#searchDialog').evaluate(e=>e.open),'Keyboard shortcut opens search');
 await page.keyboard.press('Escape');
 check(!await page.locator('#searchDialog').evaluate(e=>e.open),'Escape dismisses search');
 await go('#/contests');
 await page.locator('.skip-link').focus();await page.keyboard.press('Enter');
 await page.waitForTimeout(100);
 check(new URL(page.url()).hash==='#/contests' && await page.locator('#mainContent').evaluate(e=>document.activeElement===e),'Skip link focuses current page without changing route');
 await page.locator('#categoryFilters [data-filter="closed"]').focus();await page.keyboard.press('Enter');
 const closed=await ids('#categoryList [data-id]');
 check(closed.length>0 && closed.every(id=>data.contests.find(i=>i.id===id).status==='CLOSED'),'Keyboard status filter shows closed contests');
 const firstCard=page.locator('#categoryList ion-card').first();
 const selectedId=await firstCard.getAttribute('data-id');
 await firstCard.locator('a').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.body.dataset.page==='detail');
 check((await page.locator('#detailHeader h1').textContent())===data.contests.find(i=>i.id===selectedId).title,'Native Ionic card link opens correct detail');
 await page.locator('#backButton').click();await page.waitForFunction(()=>document.body.dataset.page==='contests');
 check(await page.locator('#categoryFilters [data-filter="closed"]').evaluate(e=>e.classList.contains('active')),'Back navigation preserves filter');
 await go('#/ai-news');await page.locator('#categoryFilters [data-filter="security"]').click();
 check((await ids('#categoryList [data-id]')).length>0,'News topic filter has results');
 await page.locator('#categorySort').click();
 await page.getByRole('radio',{name:'등록일순',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#categorySort').value==='discovered');
 await page.locator('ion-popover').waitFor({state:'detached'});
 check(true,'Ionic sort popover works');
 await go('#/ai-discovery');await page.locator('#discoveryFilters [data-filter="github"]').click();
 const github=await ids('#discoveryAllList [data-id]');
 check(github.length>0&&github.every(id=>data.aiDiscovery.find(i=>i.id===id).links.some(link=>/^https:\/\/github.com\/[^/]+\/[^/]+\/?$/.test(link.url))),'Discovery GitHub filter works: '+JSON.stringify(github));
 for(const [kind,item] of [['ai',data.aiNews[0]],['discovery',data.aiDiscovery[0]],['contest',data.contests[0]],['support',data.support[0]]]) {
  await go('#/'+kind+'/'+encodeURIComponent(item.id));
  check(await page.locator('#detailHeader h1').textContent()===item.title,`${kind} detail preserves title`);
  check(await page.locator('#detailContent').innerText()!=='',`${kind} detail has content`);
 }
 await go('#/archive');await page.locator('.archive-card').last().click();await ready(page);
 check(await page.locator('#archiveNotice').isVisible(),'Archive clearly identifies historical snapshot');
 await page.locator('#archiveNotice a').click();await ready(page);
 check(!new URL(page.url()).searchParams.has('date'),'Archive return loads latest snapshot');
 const lightBackground=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
 await page.emulateMedia({colorScheme:'dark'});
 check(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)===lightBackground && await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)==='light','OS dark mode keeps light product UI');
 await page.emulateMedia({colorScheme:'light'});
 await page.setViewportSize({width:390,height:844});
 for(const r of ['#/','#/ai-news','#/ai-discovery','#/contests','#/support']){await go(r);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Compact fallback does not overflow: ${r}`);}
 // A new scheduled snapshot must render without rebuilding the frontend.
 const next=structuredClone(data);next.aiNews[0].title='예약 데이터 갱신 검증';
 await page.route('**/data/latest.json?*',route=>route.fulfill({json:next}));
 await page.reload();await ready(page);
 await go('#/ai/'+encodeURIComponent(next.aiNews[0].id));
 check(await page.locator('#detailHeader h1').textContent()==='예약 데이터 갱신 검증','Updated scheduled JSON renders without a frontend build');
 check(errors.length===0,'No browser errors: '+errors.join('\n'));
 console.log(`PASS: ${checks} UI checks (three desktop sizes, compact fallback, real Ionic interactions, archive, scheduled JSON)`);
} finally {await browser.close();await host.close();}
