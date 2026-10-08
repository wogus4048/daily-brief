import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {launchOptions} from './ui_helpers.mjs';
import {crawlDiscoverySource} from './discovery_sources.mjs';

const browser=await chromium.launch(launchOptions);
try {
 const page=await browser.newPage();
 const fixture='<article class="Box-row"><h2><a href="/owner/ai-tool">owner / ai-tool</a></h2><p>AI image tool</p><a href="/owner/ai-tool/stargazers">1,234</a><a href="/owner/ai-tool/forks">0</a></article><article class="Box-row"><h2><a href="/owner/ai-tool">duplicate</a></h2></article>';
 await page.route('https://github.com/trending?since=daily',route=>route.fulfill({contentType:'text/html',body:fixture}));
 let result=await crawlDiscoverySource(page,'gh','GitHub',{adapter:'githubTrending'});
 assert.equal(result.count,1);assert.equal(result.items[0].title,'owner / ai-tool');
 assert.equal(result.items[0].metrics.stars,1234);assert.equal(result.items[0].metrics.forks,0);
 assert.equal(result.items[0].placement.rank,1);assert.ok(result.items[0].observedAt);
 await page.route('https://huggingface.co/spaces?sort=trending',r=>r.fulfill({contentType:'text/html',body:'<article><a href="/spaces/team/image-tool"><h4>Image tool</h4>Image to image</a></article><article><a href="/login">Login</a></article>'}));
 result=await crawlDiscoverySource(page,'hf','HF',{adapter:'huggingFaceSpaces'});
 assert.equal(result.count,1);assert.equal(result.items[0].url,'https://huggingface.co/spaces/team/image-tool');
 assert.equal(result.items[0].metrics,undefined,'Unknown popularity metrics are not invented');
 await page.unroute('https://github.com/trending?since=daily');
 await page.route('https://github.com/trending?since=daily',r=>r.fulfill({status:403,body:'Blocked'}));
 await assert.rejects(crawlDiscoverySource(page,'gh','GitHub',{adapter:'githubTrending'}),/HTTP 403/);
 await page.unroute('https://github.com/trending?since=daily');
 await page.route('https://github.com/trending?since=daily',r=>r.fulfill({body:'<html>Layout changed</html>',contentType:'text/html'}));
 await assert.rejects(crawlDiscoverySource(page,'gh','GitHub',{adapter:'githubTrending'}),/zero valid/);
 const api={request:{get:async url=>({ok:()=>true,status:()=>200,json:async()=>url.includes('topstories')?[123,124]:url.includes('123.json')?{id:123,type:'story',title:'AI post',url:'https://example.org/post',time:1791400000,score:42,descendants:0}:{id:124,deleted:true}})}};
 result=await crawlDiscoverySource(api,'hn','HN',{adapter:'hackerNewsTop',limit:2});
 assert.equal(result.count,1);assert.equal(result.items[0].url,'https://news.ycombinator.com/item?id=123');
 assert.equal(result.items[0].primaryUrl,'https://example.org/post');assert.equal(result.items[0].metrics.comments,0);
 assert.equal(result.items[0].placement.rank,1);assert.ok(result.items[0].publishedAt);
 console.log('PASS: discovery source extraction, dedup, metrics, dates, access failures and layout failures');
} finally {await browser.close();}
