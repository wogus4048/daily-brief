import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('D:/Dev/daily-brief/package.json');
const { chromium } = require('playwright');
const out=process.argv[2];const log=x=>fs.appendFileSync(out,x+'\n');
const cache=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const norm=t=>t.replace(/\[[^\]]*\]|[\s·•\-_"'「」『』()<>:.,]/g,'').replace(/^(학문과학IT|아이디어건축창업)+/,'').toLowerCase();
const known=['contestKorea','wevity'].flatMap(k=>cache.sources[k].items.map(i=>norm(i.title)));
const isKnown=t=>{const n=norm(t).slice(0,16);return n.length>5&&known.some(k=>k.includes(n))};
const open=/D\s*-\s*\d+|D-?day|오늘\s*마감|접수\s*중|접수중|모집중/i;const closed=/마감됨|접수마감|모집마감|종료/;
const P=[
 {k:'thinkyou-idea',url:n=>`https://thinkyou.co.kr/contest/?serstatus=1&serfield=0&page=${n}`,row:'.board_list .tr',link:'.title a[href*="/contest/"]',title:'.title',max:12},
 {k:'thinkyou-it',url:n=>`https://thinkyou.co.kr/contest/?serstatus=1&serfield=5&page=${n}`,row:'.board_list .tr',link:'.title a[href*="/contest/"]',title:'.title',max:12},
 {k:'allcon',url:n=>`https://www.all-con.co.kr/list/contest/1/${n}?sortname=cl_order&sortorder=asc&stx=&sfl=&t=1&ct=&sc=&tg=`,row:'tbody.tbl-list tr',link:'a[href*="/view/contest/"]',title:'td.title',max:30},
 {k:'gonghunt',url:n=>`https://app.gonghunt.com/contests?page=${n}`,row:'article.gh-card',link:'a',title:'h3',max:6},
];
const b=await chromium.launch({headless:true});const c=await b.newContext({locale:'ko-KR',viewport:{width:1440,height:1600},ignoreHTTPSErrors:true});const p=await c.newPage();
for(const s of P){const t0=Date.now();const seen=new Map();let stop='max',n=0,run=0,firstRows=0,tot=0;
 for(n=1;n<=s.max;n++){let r;try{r=await p.goto(s.url(n),{waitUntil:'domcontentloaded',timeout:45000})}catch(e){stop='gotoErr '+e.message.slice(0,40);break}
  if(!r.ok()){stop='HTTP'+r.status();break}await p.waitForTimeout(s.k==='linkareer'||s.k==='gonghunt'?1800:700);
  const rows=await p.$$eval(s.row,(ls,a)=>ls.map(l=>{const x=l.querySelector(a.link)||l.closest('a')||(l.parentElement?.closest('a'));return {h:x?.href||'',t:(l.querySelector(a.title)?.innerText||l.innerText).replace(/\s+/g,' ').slice(0,90),x:l.innerText.replace(/\s+/g,' ').slice(0,260)}}),{link:s.link,title:s.title});
  const valid=rows.filter(r=>r.h);if(n===1)firstRows=valid.length;tot+=valid.length;if(!valid.length){stop='empty';break}
  const fresh=valid.filter(r=>!seen.has(r.h));if(!fresh.length){stop='repeated';break}
  const o=fresh.filter(r=>open.test(r.x)&&!closed.test(r.x));fresh.forEach(r=>seen.set(r.h,{...r,o:open.test(r.x)&&!closed.test(r.x)}));
  run=o.length?0:run+1;if(s.run&&run>=s.run){stop='closedRun';break}}
 const all=[...seen.values()];fs.writeFileSync(out+'.'+s.k+'.json',JSON.stringify(all));const op=all.filter(x=>x.o);const nw=op.filter(x=>!isKnown(x.t));
 log(`${s.k} pages=${n} stop=${stop} firstRows=${firstRows} uniq=${all.length} open=${op.length} newVsCKWE=${nw.length} sec=${Math.round((Date.now()-t0)/1000)}`);
 log('  new: '+nw.slice(0,9).map(x=>x.t.slice(0,38)).join(' / '));
 log('  sample: '+(all[0]?.x||'').slice(0,150));
}
await b.close();log('DONE');
