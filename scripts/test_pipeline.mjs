import assert from 'node:assert/strict';
import { actionableMetricFailures, collectMetrics, repositories } from './collect_github_metrics.mjs';
import { assessHealth, assessPublicationArtifacts, hasUsableCache, healthExitCode } from './pipeline_health.mjs';

const brief = {aiDiscovery:[{links:[{url:'https://github.com/owner/project.git'},{url:'https://github.com/owner/project/issues'}]},{links:[{url:'https://github.com/owner/project'}]}]};
assert.deepEqual(repositories(brief), ['owner/project']);
const now = new Date('2026-10-08T03:00:00Z');
const good = await collectMetrics(brief, {}, async()=>({ok:true,json:async()=>({stargazers_count:1234,forks_count:0})}), now);
assert.equal(good.repositories['owner/project'].forks, 0);
const failed = await collectMetrics(brief, good, async()=>({ok:false,status:403}), new Date('2026-10-09T03:00:00Z'));
assert.equal(failed.repositories['owner/project'].stars,1234);
assert.equal(failed.repositories['owner/project'].fetchedAt,now.toISOString());
assert.equal(failed.repositories['owner/project'].status,'STALE');
const missing = await collectMetrics(brief, {}, async()=>{throw new Error('offline');},now);
assert.equal(missing.repositories['owner/project'].status,'FAILED');
assert.equal(missing.repositories['owner/project'].stars,undefined);
const invalid = await collectMetrics(brief, {}, async()=>({ok:true,json:async()=>({stargazers_count:-1,forks_count:0})}),now);
assert.equal(invalid.repositories['owner/project'].status,'FAILED');

// First 404 signals a new problem and keeps the previous good sample.
const first404 = await collectMetrics(brief, good, async()=>({ok:false,status:404}), new Date('2026-10-09T03:00:00Z'));
assert.equal(first404.repositories['owner/project'].status,'STALE');
assert.equal(first404.repositories['owner/project'].stars,1234);
assert.equal(first404.repositories['owner/project'].forks,0);
assert.equal(first404.repositories['owner/project'].fetchedAt,now.toISOString());
assert.deepEqual(actionableMetricFailures(first404,good).map(([repo])=>repo),['owner/project']);

// Other repositories still alert even when their 404 repeats.
const repeated404 = await collectMetrics(brief, first404, async()=>({ok:false,status:404}), new Date('2026-10-10T03:00:00Z'));
assert.equal(repeated404.repositories['owner/project'].status,'STALE');
assert.equal(repeated404.repositories['owner/project'].stars,1234);
assert.equal(repeated404.repositories['owner/project'].fetchedAt,now.toISOString());
assert.deepEqual(actionableMetricFailures(repeated404,first404).map(([repo])=>repo),['owner/project']);

// ARTEX alone is the explicitly acknowledged repeated-404 exception.
const artexPrior = {repositories:{'Autumn-27/ARTEX':first404.repositories['owner/project']}};
const artexRepeat = {repositories:{'Autumn-27/ARTEX':repeated404.repositories['owner/project']}};
assert.deepEqual(actionableMetricFailures(artexRepeat,artexPrior),[]);

// Missing original metrics are never made up; unrelated repositories always alert.
const unknown404 = await collectMetrics(brief, {}, async()=>({ok:false,status:404}),now);
assert.deepEqual(actionableMetricFailures(unknown404,{}).map(([repo])=>repo),['owner/project']);
const repeatedUnknown404 = await collectMetrics(brief, unknown404, async()=>({ok:false,status:404}),new Date('2026-10-10T03:00:00Z'));
assert.equal(repeatedUnknown404.repositories['owner/project'].status,'FAILED');
assert.deepEqual(actionableMetricFailures(repeatedUnknown404,unknown404).map(([repo])=>repo),['owner/project']);

// A different error and non-404 failures must still alert.
const newly403 = await collectMetrics(brief, repeated404, async()=>({ok:false,status:403}),new Date('2026-10-11T03:00:00Z'));
assert.deepEqual(actionableMetricFailures(newly403,repeated404).map(([repo])=>repo),['owner/project']);
assert.deepEqual(actionableMetricFailures(failed,good).map(([repo])=>repo),['owner/project']);

// Recovery resets 404 acknowledgement. Its next 404 is actionable again.
const recovered = await collectMetrics(brief,repeated404,async()=>({ok:true,json:async()=>({stargazers_count:1240,forks_count:1})}),new Date('2026-10-11T04:00:00Z'));
assert.equal(recovered.repositories['owner/project'].status,'OK');
const afterRecovery404 = await collectMetrics(brief,recovered,async()=>({ok:false,status:404}),new Date('2026-10-11T05:00:00Z'));
assert.deepEqual(actionableMetricFailures(afterRecovery404,recovered).map(([repo])=>repo),['owner/project']);

// One known 404 does not suppress a new failure from another repository.
const mixedNow = {repositories:{...artexRepeat.repositories,'new/problem':newly403.repositories['owner/project']}};
const mixedBefore = artexPrior;
assert.deepEqual(actionableMetricFailures(mixedNow,mixedBefore).map(([repo])=>repo),['new/problem']);
const manifest = {active:[{key:'required',required:true},{key:'optional'}]};
const cache = {date:'2026-10-08',sources:{required:{status:'OK',count:3},optional:{status:'FAILED',count:0,error:'HTTP 403'}}};
const usable={...cache,crawler:{engine:'playwright-chromium'},sources:{optional:{status:'FAILED',count:0,items:[],actionableCount:0,actionableItems:[]},required:{status:'OK',count:1,items:[{url:'https://example.com'}],actionableCount:0,actionableItems:[]}}};
assert.equal(hasUsableCache(usable,manifest,'2026-10-08'),true);
assert.equal(hasUsableCache(usable,manifest,'2026-10-09'),false);
assert.equal(hasUsableCache({...usable,crawler:{}},manifest,'2026-10-08'),false);
assert.equal(hasUsableCache({...usable,sources:{}},manifest,'2026-10-08'),false);
assert.equal(hasUsableCache({...usable,sources:{...usable.sources,optional:{status:'FAILED'}}},manifest,'2026-10-08'),false);
const expanded={...manifest,nextCandidates:[{key:'newDiscovery',status:'SHADOW',crawlerSpec:{adapter:'hackerNewsTop'}}]};
assert.equal(hasUsableCache(usable,expanded,'2026-10-08'),false,'New shadow sources must actually be crawled before scheduled cache reuse');
assert.equal(hasUsableCache({...usable,shadowSources:{newDiscovery:{status:'OK',items:[],count:0,actionableItems:[],actionableCount:0}}},expanded,'2026-10-08'),false,'Empty successful shadow results are invalid');
assert.equal(hasUsableCache({...usable,shadowSources:{newDiscovery:{status:'FAILED',items:[],count:0,actionableItems:[],actionableCount:0}}},expanded,'2026-10-08'),true,'A recorded optional shadow failure may be reused');
let health=assessHealth(cache,manifest,{date:'2026-10-07'},now);
assert.equal(health.publication.status,'STALE');
assert.equal(health.sources.status,'PARTIAL');
assert.deepEqual(health.sources.failed,['optional']);
assert.equal(healthExitCode(health,{sourcesOnly:true}),0,'optional source failure is warning only for crawl');
assert.equal(healthExitCode(health),1,'overdue publication still fails health');
health=assessHealth(cache,manifest,{date:'2026-10-07'},new Date('2026-10-07T23:50:00Z'));
assert.equal(health.publication.status,'PENDING');
health=assessHealth({...cache,sources:{}},manifest,{date:'2026-10-08'},now);
assert.equal(health.sources.status,'FAILED');
assert.equal(health.publication.status,'OK');
assert.equal(healthExitCode(health,{sourcesOnly:true}),1,'required source failure must fail crawl health');
assert.equal(healthExitCode(assessHealth(cache,manifest,{date:'2026-10-08'},now)),0,'current publication plus optional source outage is usable');
assert.equal(assessHealth({...cache,date:'2026-10-07'},manifest,{date:'2026-10-08'},now).collection.status,'STALE');
const snapshotBytes=Buffer.from(JSON.stringify({date:'2026-10-08'}));
const auditBytes=Buffer.from(JSON.stringify({date:'2026-10-08',completedAt:'2026-10-08T10:00:00+09:00'}));
assert.equal(assessPublicationArtifacts('2026-10-08',snapshotBytes,snapshotBytes,auditBytes).status,'OK');
assert.equal(assessPublicationArtifacts('2026-10-08',snapshotBytes,null,auditBytes).status,'INCOMPLETE');
assert.equal(assessPublicationArtifacts('2026-10-08',snapshotBytes,Buffer.from('{}'),auditBytes).status,'INCOMPLETE');
assert.equal(assessPublicationArtifacts('2026-10-08',snapshotBytes,snapshotBytes,Buffer.from('{}')).status,'INCOMPLETE');
assert.equal(healthExitCode({sources:{status:'OK'},collection:{status:'OK'},publication:{status:'INCOMPLETE'}}),1);
console.log('PASS: metrics success/zero/retention/errors and separate source/collection/publication health');
