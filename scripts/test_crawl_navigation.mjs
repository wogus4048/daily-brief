import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {launchOptions} from './ui_helpers.mjs';
import {assertAnySourceSucceeded,crawlContestKorea,crawlDacon,crawlGeneric,gotoWithRetry} from './crawl_sources.mjs';

const DACON='https://www.dacon.io/competitions';
// A bot-check interstitial answers first, then the app renders after the crawler's old fixed wait.
const interstitial='<script>setTimeout(()=>location.reload(),300)</script>';
const delayedListing=`<div id="list"></div><script>setTimeout(()=>{list.innerHTML='<article><a href="/competitions/official/1/overview">Open contest 참가신청중</a></article>'},2600)</script>`;

const browser=await chromium.launch(launchOptions);
try {
 const page=await browser.newPage();
 let requests=0;
 await page.route(DACON,route=>{
  requests+=1;
  route.fulfill(requests===1?{status:202,contentType:'text/html',body:interstitial}:{status:200,contentType:'text/html',body:delayedListing});
 });
 const result=await crawlDacon(page);
 assert.equal(requests,2,'The interstitial reloads into the real page');
 assert.equal(result.count,1,'A listing that renders after the interstitial is still collected');
 const slow='https://slow.example/list';
 let slowRequests=0;
 await page.route(slow,route=>{
  slowRequests+=1;
  if(slowRequests>1) route.fulfill({status:200,contentType:'text/html',body:'<p>ok</p>'});
 });
 const response=await gotoWithRetry(page,slow,{timeout:400});
 assert.equal(response.status(),200,'A navigation timeout is retried once');
 assert.equal(slowRequests,2);
 await page.route('https://down.example/list',()=>{});
 await assert.rejects(gotoWithRetry(page,'https://down.example/list',{timeout:300}),/Timeout/);
 assert.doesNotThrow(()=>assertAnySourceSucceeded({a:{status:'FAILED',count:0},b:{status:'OK',count:3}}));
 assert.throws(()=>assertAnySourceSucceeded({a:{status:'FAILED',count:0}}),/every active crawler failed/);

 // ContestKorea keeps years of closed contests in one list, with open ones scattered up to seven pages apart.
 const row=(id,day,category='031410001')=>`<li><div class="title"><a href="view.php?Txt_bcode=${category}&int_gbn=1&str_no=${id}"><span class="category">아이디어•건축•창업</span><span class="txt">공모전 ${id}</span></a></div><div class="d-day"><span class="day">${day}</span></div></li>`;
 const sidebar='<ol><li><a href="view.php?str_no=ad">광고 공모전 D-3</a></li></ol>';
 const asked=[];
 await page.route('https://www.contestkorea.com/sub/list.php*',route=>{
  const url=new URL(route.request().url());
  const n=Number(url.searchParams.get('page'));
  const category=url.searchParams.get('Txt_bcode');
  asked.push(category+':'+n);
  const open=category==='031410001'&&[1,9,25].includes(n);
  const rows=category==='031410001'?row(`a${n}`,open?'D-5':'캠페인마감')+(n===1?row('shared','D-9'):''):n===1?row('shared','D-9',category):'';
  route.fulfill({status:200,contentType:'text/html',body:`${sidebar}<div class="list_style_2"><ul>${rows}</ul></div>`});
 });
 const contest=await crawlContestKorea(page);
 assert.deepEqual(contest.items.map(item=>item.url.split('str_no=')[1]).sort(),['a1','a9','shared'],'Open rows across a gap are kept; closed and sidebar rows are not');
 assert.equal(contest.items.filter(item=>item.url.includes('shared')).length,1,'A contest listed in two categories is one item');
 assert.ok(!contest.items.some(item=>item.url.includes('Txt_bcode')),'The item URL does not depend on the category it was listed in');
 assert.equal(asked.filter(entry=>entry.startsWith('031410001:')).length,24,'Reading stops after fifteen pages without an open contest');
 assert.deepEqual(contest.coverage.map(({pagesRead,reachedEnd,stoppedBy,lastOpenPage,longestClosedRun})=>({pagesRead,reachedEnd,stoppedBy,lastOpenPage,longestClosedRun})),[
  {pagesRead:24,reachedEnd:true,stoppedBy:'closedRun',lastOpenPage:9,longestClosedRun:7},
  {pagesRead:2,reachedEnd:false,stoppedBy:'blank',lastOpenPage:1,longestClosedRun:0},
 ],'Coverage records how far each category was read, and a blank page in a long list is not its end');
 let flakyRequests=0;
 await page.route('https://list.example/*',route=>{
  const url=new URL(route.request().url());
  const n=Number(url.searchParams.get('gp'));
  if(url.pathname==='/broken'&&n>1) return route.fulfill({status:503,contentType:'text/html',body:'busy'});
  if(url.pathname==='/down') return route.fulfill({status:503,contentType:'text/html',body:'busy'});
  if(url.pathname==='/flaky'&&n===2&&(flakyRequests+=1)===1) return route.fulfill({status:200,contentType:'text/html',body:'<ul class="list"></ul>'});
  if(url.pathname==='/flaky'&&n>2) return route.fulfill({status:200,contentType:'text/html',body:'<ul class="list"></ul>'});
  if(url.pathname==='/blocked') return route.fulfill({status:200,contentType:'text/html',body:'<p>Checking your browser</p>'});
  if(url.pathname==='/loop') return route.fulfill({status:200,contentType:'text/html',body:'<ul class="list"><li><a href="/view?ix=last">공모전 D-2</a></li></ul>'});
  const rows=url.pathname==='/short'&&n>2?'':`<li><a href="/view?ix=${url.pathname.slice(1)}-${n}&gp=${n}">공모전 D-2</a></li><li><a href="/view?ix=shared&gp=${n}">공모전 D-2</a></li>`;
  route.fulfill({status:200,contentType:'text/html',body:`<ul class="list">${rows}</ul>`});
 });
 const listings={linkSelector:'.list a',pagination:{urls:['https://list.example/short?a=1','https://list.example/long?a=1'],param:'gp',maxPages:3,keepParams:['ix']}};
 const generic=await crawlGeneric(page,'paged','Paged',listings);
 assert.equal(generic.count,6,'Every page of every listing is collected, and a contest on several pages is one item');
 assert.deepEqual(generic.coverage.map(({reachedEnd,stoppedBy})=>({reachedEnd,stoppedBy})),[
  {reachedEnd:true,stoppedBy:'empty'},
  {reachedEnd:false,stoppedBy:'maxPages'},
 ],'A listing cut off by the page limit is reported as unfinished');
 const partial=await crawlGeneric(page,'paged','Paged',{...listings,pagination:{...listings.pagination,urls:['https://list.example/broken?a=1']}});
 assert.equal(partial.count,2,'Rows read before a failed page are kept');
 assert.deepEqual(partial.coverage.map(({pagesRead,reachedEnd,stoppedBy})=>({pagesRead,reachedEnd,stoppedBy})),[{pagesRead:1,reachedEnd:false,stoppedBy:'error'}],'A failed page is recorded as an unfinished listing');
 await assert.rejects(crawlGeneric(page,'paged','Paged',{...listings,pagination:{...listings.pagination,urls:['https://list.example/down?a=1']}}),/HTTP 503/,'A source that fails on its first page is a failed source');
 const uneven=await crawlGeneric(page,'paged','Paged',{...listings,pagination:{...listings.pagination,maxPages:5,urls:['https://list.example/flaky?a=1','https://list.example/blocked?a=1','https://list.example/loop?a=1']}});
 assert.deepEqual(uneven.coverage.map(({pagesRead,reachedEnd,stoppedBy})=>({pagesRead,reachedEnd,stoppedBy})),[
  {pagesRead:3,reachedEnd:true,stoppedBy:'empty'},
  {pagesRead:1,reachedEnd:false,stoppedBy:'blank'},
  {pagesRead:2,reachedEnd:true,stoppedBy:'repeated'},
 ],'A briefly empty page is read again, an empty first page is unread, and a repeated last page ends the listing');
 console.log('PASS: crawler waits through interstitials, retries timeouts, keeps partial results and reads listings to their end');
} finally {await browser.close();}
