import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {launchOptions} from './ui_helpers.mjs';
import {assertAnySourceSucceeded,crawlDacon,gotoWithRetry} from './crawl_sources.mjs';

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
 console.log('PASS: crawler waits through interstitials, retries timeouts and keeps partial results');
} finally {await browser.close();}
