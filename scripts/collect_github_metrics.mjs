import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function repositories(brief) {
  const names = new Set();
  for (const item of brief.aiDiscovery || []) for (const link of item.links || []) {
    try {
      const url = new URL(link.url);
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.hostname.toLowerCase() === 'github.com' && parts.length === 2 && parts.every(p=>/^[\w.-]+$/.test(p))) {
        names.add(parts.join('/').replace(/\.git$/i,''));
      }
    } catch {}
  }
  return [...names].sort();
}

export async function collectMetrics(brief, previous = {}, request = fetch, now = new Date()) {
  const checkedAt = now.toISOString();
  const rows = await Promise.all(repositories(brief).map(async repo => {
    try {
      const headers = {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const response = await request(`https://api.github.com/repos/${repo}`, {headers,signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (![data.stargazers_count,data.forks_count].every(n=>Number.isSafeInteger(n) && n>=0)) throw new Error('Invalid GitHub counts');
      return [repo,{stars:data.stargazers_count,forks:data.forks_count,fetchedAt:checkedAt,checkedAt,status:'OK'}];
    } catch (error) {
      const old = previous.repositories?.[repo];
      const valid = old && [old.stars,old.forks].every(n=>Number.isSafeInteger(n) && n>=0) && Number.isFinite(Date.parse(old.fetchedAt));
      return [repo,{...(valid?{stars:old.stars,forks:old.forks,fetchedAt:old.fetchedAt}:{}),checkedAt,status:valid?'STALE':'FAILED',error:String(error.message)}];
    }
  }));
  return {generatedAt:checkedAt,repositories:Object.fromEntries(rows)};
}

// Only the specifically acknowledged ARTEX 404 is a known availability gap.
// Keep true STALE/FAILED statuses. Other repositories always signal failures,
// as do changed errors and a regression after ARTEX has recovered.
export function actionableMetricFailures(current, previous = {}) {
  return Object.entries(current.repositories || {}).filter(([repo, row]) => {
    if (row.status === 'OK') return false;
    const old = previous.repositories?.[repo];
    const repeated404 = repo === 'Autumn-27/ARTEX'
      && row.error === 'HTTP 404'
      && (old?.status === 'STALE' || old?.status === 'FAILED')
      && old.error === 'HTTP 404';
    return !repeated404;
  });
}

async function main() {
  const brief = JSON.parse(await fs.readFile('data/latest.json','utf8'));
  let previous = {};
  try { previous = JSON.parse(await fs.readFile('data/github-metrics.json','utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = await collectMetrics(brief, previous);
  await fs.writeFile('data/github-metrics.json.tmp',JSON.stringify(result,null,2)+'\n');
  await fs.rename('data/github-metrics.json.tmp','data/github-metrics.json');
  const failed = Object.entries(result.repositories).filter(([,r])=>r.status!=='OK');
  const actionable = actionableMetricFailures(result, previous);
  const summary = ['## GitHub repository metrics','',...Object.entries(result.repositories).map(([repo,r])=>`- ${repo}: ${r.status} (${r.stars??'unknown'} stars, ${r.forks??'unknown'} forks)`)].join('\n')+'\n';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary
    + '\nUnavailable or stale repositories: ' + failed.length
    + '\nNew or changed failures requiring attention: ' + actionable.length + '\n');
  for (const [repo,r] of failed) console.error(`::warning::${repo}: ${r.error}`);
  if (actionable.length) process.exitCode=1;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
