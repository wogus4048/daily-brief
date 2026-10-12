import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function assessPublicationArtifacts(date, latestBytes, archiveBytes, auditBytes) {
  if (!latestBytes || !archiveBytes || !auditBytes) return {status:'INCOMPLETE',reason:'missing latest, dated archive, or research evidence'};
  if (!latestBytes.equals(archiveBytes)) return {status:'INCOMPLETE',reason:'dated archive differs from latest'};
  try {
    const snapshot=JSON.parse(latestBytes.toString('utf8'));
    const audit=JSON.parse(auditBytes.toString('utf8'));
    if (snapshot.date!==date || audit.date!==date || !audit.completedAt) {
      return {status:'INCOMPLETE',reason:'snapshot or research evidence date mismatch'};
    }
  } catch {
    return {status:'INCOMPLETE',reason:'invalid snapshot or research evidence JSON'};
  }
  return {status:'OK',reason:null};
}

export function hasUsableCache(cache, manifest, date) {
  if(cache?.date!==date || cache?.crawler?.engine!=='playwright-chromium') return false;
  const active=(manifest.active||[]).filter(e=>e.status!=='DEGRADED');
  const validResult=source=>source && ['OK','FAILED'].includes(source.status) && Array.isArray(source.items) && Array.isArray(source.actionableItems)
    && source.count===source.items.length && source.actionableCount===source.actionableItems.length
    && (source.status!=='OK'||source.count>0);
  const shadow=(manifest.nextCandidates||[]).filter(e=>e.status==='SHADOW'&&e.crawlerSpec);
  return shadow.every(e=>validResult(cache.shadowSources?.[e.key])) && active.length>0 && active.every(entry=>{
    const source=cache.sources?.[entry.key];
    return validResult(source)
      && (!entry.required || (source.status==='OK' && source.count>0));
  });
}

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

// An optional source outage is visible in the step summary and annotations,
// but must not turn a valid source-cache publication into a failed job.
export function healthExitCode(health, { sourcesOnly = false } = {}) {
  if (health.sources.status === 'FAILED') return 1;
  if (!sourcesOnly && [health.collection.status, health.publication.status].some(status=>['STALE','INCOMPLETE'].includes(status))) return 1;
  return 0;
}

async function main() {
  const sourcesOnly=process.argv.includes('--sources-only');
  const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
  const [cache,manifest,brief]=await Promise.all(['data/source-cache/latest.json','data/crawler-sources.json','data/latest.json'].map(read));
  const health=assessHealth(cache,manifest,brief);
  if (health.publication.status==='OK') {
    const readIfPresent=async filename=>fs.readFile(filename).catch(error=>{
      if(error.code==='ENOENT') return null;
      throw error;
    });
    const [latest,archive,research]=await Promise.all([
      readIfPresent('data/latest.json'),
      readIfPresent(`data/archive/${brief.date}.json`),
      readIfPresent(`data/research/${brief.date}.json`),
    ]);
    health.publication.artifacts=assessPublicationArtifacts(brief.date,latest,archive,research);
    if (health.publication.artifacts.status!=='OK') health.publication.status='INCOMPLETE';
  }
  const lines=['## Daily Brief pipeline health','',`- Expected date (Seoul): ${health.expectedDate}`,`- Collection: ${health.collection.status} (${health.collection.date})`,`- Publication: ${health.publication.status} (${health.publication.date})`,`- Source health: ${health.sources.status}`,'','| Source | Required | Status | Items |','| --- | --- | --- | --- |'];
  for(const entry of manifest.active||[]) {
    const source=cache.sources?.[entry.key];
    lines.push(`| ${entry.key} | ${Boolean(entry.required)} | ${source?.status||'MISSING'} | ${source?.count??0} |`);
    if(source?.status!=='OK') {
      const reason=(source?.error||'No source result').split('\n')[0].replace(/[\r\n]/g,' ');
      console.error(`::warning::${entry.key}: ${reason}`);
    }
  }
  if(health.sources.status==='PARTIAL') lines.push('','Some optional sources failed. Valid collected data remains usable; see warnings above and record source gaps during editorial research.');
  if(!sourcesOnly && health.publication.status==='STALE') lines.push('','Publication is overdue. Inspect the ChatGPT scheduled research task, then the dated candidate branch and promotion workflow. A successful crawl or Pages deployment does not publish a new briefing.');
  if(!sourcesOnly && health.publication.status==='INCOMPLETE') lines.push('','Publication is incomplete: '+health.publication.artifacts.reason+'. Do not interpret a successful Pages deploy as a verified daily publication.');
  const summary=lines.join('\n')+'\n';
  console.log(summary);
  if(process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
  await fs.mkdir('artifacts',{recursive:true});
  await fs.writeFile('artifacts/pipeline-health.json',JSON.stringify(health,null,2)+'\n');
  process.exitCode=healthExitCode(health,{sourcesOnly});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
