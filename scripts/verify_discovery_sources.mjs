import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {crawlDiscoverySource} from './discovery_sources.mjs';

const manifest=JSON.parse(await fs.readFile('data/crawler-sources.json','utf8'));
const entries=[...manifest.active,...manifest.nextCandidates].filter(e=>e.crawlerSpec?.adapter);
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
const report={checkedAt:new Date().toISOString(),sources:{}};
try {
 for(const entry of entries) {
  const page=await browser.newPage();
  try {
   const result=await crawlDiscoverySource(page,entry.key,entry.name,entry.crawlerSpec);
   for(const item of result.items) {
    if(!item.title||!/^https?:\/\//.test(item.url)||!item.observedAt||!item.placement?.rank) throw new Error('Missing required source evidence');
   }
   report.sources[entry.key]=result;
   console.log(`${entry.key}: OK ${result.count} items; ${result.items[0].title}`);
  } catch(error) {
   report.sources[entry.key]={status:'FAILED',error:error.message};process.exitCode=1;
   console.error(`${entry.key}: FAILED ${error.message}`);
  } finally {await page.close();}
 }
}finally{await browser.close();}
await fs.mkdir('artifacts',{recursive:true});
await fs.writeFile('artifacts/discovery-source-verification.json',JSON.stringify(report,null,2)+'\n');
