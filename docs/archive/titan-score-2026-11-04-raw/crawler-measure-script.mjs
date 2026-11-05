import { createRequire } from 'node:module';
import fs from 'node:fs';
const R='file:///D:/Dev/daily-brief/scripts/crawl_sources.mjs';
const { crawlContestKorea, crawlGeneric } = await import(R);
const require = createRequire('D:/Dev/daily-brief/package.json');
const { chromium } = require('playwright');
const manifest=JSON.parse(fs.readFileSync('D:/Dev/daily-brief/data/crawler-sources.json','utf8'));
const w=manifest.nextCandidates.find(x=>x.key==='wevity');
const b=await chromium.launch({headless:true});const ctx=await b.newContext({ignoreHTTPSErrors:true,locale:'ko-KR',timezoneId:'Asia/Seoul',viewport:{width:1440,height:1600}});
const run=async(n,f)=>{const p=await ctx.newPage();const t=Date.now();const r=await f(p);await p.close();console.log(n,'sec',Math.round((Date.now()-t)/1000),'items',r.count,'actionable',r.actionableCount);for(const c of r.coverage)console.log('  ',c.pagesRead,c.reachedEnd,c.stoppedBy,c.url.slice(-30));return r};
const t0=Date.now();const [ck,we]=await Promise.all([run('contestKorea',crawlContestKorea),run('wevity',p=>crawlGeneric(p,'wevity','위비티',w.crawlerSpec))]);
console.log('wall sec',Math.round((Date.now()-t0)/1000));
await b.close();
const K={'DATA·AI 분석':/DATA.?AI 분석/i,'대경권 IR':/대경권/,'한국체육산업개발':/체육산업개발/,'꿀팁':/꿀팁/,'성평등 AI':/성평등/,'LOTTE AX':/LOTTE AX/i,'햇반':/햇반/,'현대차 앱':/차량용 앱/,'AI 플레이':/AI 플레이/,'조달청':/조달청/,'스페이스':/스페이스 해커톤/,'Nitto':/Nitto/i,'KEIT':/KEIT|혁신 아이디어 공모/,'메치니코프':/메치니코프/,'홍제천':/홍제천/,'스마트시티':/스마트시티/,'재정교육':/재정교육/,'창업 해커톤':/창업 해커톤/,'Spark-up':/Spark/i};
const titles=s=>s.items.map(i=>i.title+' '+i.rawText);let c=0;const miss=[];
for(const [n,rx] of Object.entries(K)){const a=titles(ck).some(t=>rx.test(t)),e=titles(we).some(t=>rx.test(t));if(a||e)c++;else miss.push(n);console.log((a?'CK ':'-- ')+(e?'WE ':'-- ')+n)}
console.log('hit',c,'/19 miss',miss.join(','));
const known=fs.readFileSync('D:/Dev/daily-brief/data/source-cache/latest.json','utf8');const old=JSON.parse(known).sources?.contestKorea;console.log('old cached ck',old?.count,old?.actionableCount,old?.url);
fs.writeFileSync(process.argv[2],JSON.stringify({ck:{count:ck.count,titles:ck.items.map(i=>i.title)},we:{count:we.count,titles:we.items.map(i=>i.title)}},null,1));
