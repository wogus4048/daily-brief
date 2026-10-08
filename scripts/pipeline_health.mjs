import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function assessHealth(cache, manifest, brief, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(now));
  const active=(manifest.active||[]).filter(e=>e.status!=='DEGRADED');
  const failed=active.filter(e=>cache.sources?.[e.key]?.status!=='OK' || !(cache.sources[e.key].count>0));
  const requiredFailed=failed.filter(e=>e.required).map(e=>e.key);
  return {
    checkedAt:now.toISOString(), expectedDate:today,
    collection:{date:cache.date||null,status:cache.date===today?'OK':hour<10?'PENDING':'STALE'},
    publication:{date:brief.date||null,status:brief.date===today?'OK':hour<10?'PENDING':'STALE'},
    sources:{status:requiredFailed.length?'FAILED':failed.length?'PARTIAL':'OK',failed:failed.map(e=>e.key),requiredFailed},
  };
}

async function main() {
  const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
  const [cache,manifest,brief]=await Promise.all(['data/source-cache/latest.json','data/crawler-sources.json','data/latest.json'].map(read));
  const health=assessHealth(cache,manifest,brief);
  const lines=['## Daily Brief pipeline health','',`- Expected date (Seoul): ${health.expectedDate}`,`- Collection: ${health.collection.status} (${health.collection.date})`,`- Publication: ${health.publication.status} (${health.publication.date})`,'','| Source | Required | Status | Items |','| --- | --- | --- | --- |'];
  for(const entry of manifest.active||[]) {
    const source=cache.sources?.[entry.key];
    lines.push(`| ${entry.key} | ${Boolean(entry.required)} | ${source?.status||'MISSING'} | ${source?.count??0} |`);
    if(source?.status!=='OK') {
      const reason=(source?.error||'No source result').split('\n')[0].replace(/[\r\n]/g,' ');
      console.error(`::warning::${entry.key}: ${reason}`);
    }
  }
  if(health.publication.status==='STALE') lines.push('','Publication is overdue. Inspect the ChatGPT scheduled research task, then the dated candidate branch and promotion workflow. A successful crawl does not publish a briefing.');
  const summary=lines.join('\n')+'\n';
  console.log(summary);
  if(process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
  await fs.mkdir('artifacts',{recursive:true});
  await fs.writeFile('artifacts/pipeline-health.json',JSON.stringify(health,null,2)+'\n');
  const sourceOnly=process.argv.includes('--sources-only');
  if(health.sources.status!=='OK' || (!sourceOnly && [health.collection.status,health.publication.status].includes('STALE'))) process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
