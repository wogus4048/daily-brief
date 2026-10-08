// Public, read-only inventory adapters. Results are research leads, not approved posts.
const LISTINGS = {
  githubTrending: 'https://github.com/trending?since=daily',
  huggingFaceModels: 'https://huggingface.co/models?sort=trending',
  huggingFaceSpaces: 'https://huggingface.co/spaces?sort=trending',
  hackerNewsTop: 'https://news.ycombinator.com/',
};
const clean = value => String(value || '').replace(/\s+/g,' ').trim();
function httpUrl(value, base) {
  try { const url=new URL(value,base);return ['http:','https:'].includes(url.protocol)?url.href:null; } catch {return null;}
}
function wholeCount(value) {
  const text=clean(value).replaceAll(',','');
  return /^\d+$/.test(text)&&Number.isSafeInteger(Number(text))?Number(text):undefined;
}
async function getJson(page,url) {
  const response=await page.request.get(url,{timeout:20000});
  if(!response.ok()) throw new Error(`HTTP ${response.status()}: ${url}`);
  return response.json();
}

export async function crawlDiscoverySource(page,key,name,spec) {
  const url=LISTINGS[spec.adapter];
  if(!url) throw new Error(`Unsupported discovery adapter: ${spec.adapter}`);
  const observedAt=new Date().toISOString();
  const limit=Math.max(1,Math.min(50,Number.isInteger(spec.limit)?spec.limit:30));
  let items=[];
  if(spec.adapter==='hackerNewsTop') {
    const ids=await getJson(page,'https://hacker-news.firebaseio.com/v0/topstories.json');
    if(!Array.isArray(ids)||!ids.length||!ids.every(Number.isSafeInteger)) throw new Error('Invalid HN top stories response');
    // Five concurrent requests, bounded to the first page-sized inventory.
    for(let offset=0;offset<Math.min(ids.length,limit);offset+=5) {
      const batch=ids.slice(offset,Math.min(offset+5,limit));
      const rows=await Promise.all(batch.map(id=>getJson(page,`https://hacker-news.firebaseio.com/v0/item/${id}.json`)));
      rows.forEach((row,index)=>{
        if(row?.deleted||row?.dead||row?.type==='job') return;
        if(!row || row.id!==batch[index] || row.type!=='story' || !clean(row.title) || !Number.isSafeInteger(row.time)) throw new Error('Invalid HN story response');
        const discussionUrl=`https://news.ycombinator.com/item?id=${row.id}`;
        const metrics={};
        for(const [field,value] of [['points',row.score],['comments',row.descendants]]) if(Number.isSafeInteger(value)&&value>=0) metrics[field]=value;
        items.push({source:name,title:clean(row.title),url:discussionUrl,discussionUrl,primaryUrl:httpUrl(row.url),publishedAt:new Date(row.time*1000).toISOString(),observedAt,metrics,placement:{listUrl:url,rank:offset+index+1,label:'HN top stories'},rawText:clean(row.title),statusHints:[]});
      });
    }
  } else {
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    if(response&&!response.ok()) throw new Error(`HTTP ${response.status()}: ${url}`);
    const rows=await page.evaluate(adapter=>{
      const cards=[...document.querySelectorAll(adapter==='githubTrending'?'article.Box-row':'article')];
      return cards.map((card,index)=>{
        const link=card.querySelector(adapter==='githubTrending'?'h2 a':'a[href]');
        return {href:link?.getAttribute('href'),title:adapter==='githubTrending'?link?.textContent:card.querySelector('h4, h3, h2')?.textContent,
          rawText:card.innerText,rank:index+1,stars:card.querySelector('a[href$="/stargazers"]')?.textContent,forks:card.querySelector('a[href$="/forks"]')?.textContent};
      });
    },spec.adapter);
    const seen=new Set();
    for(const row of rows.slice(0,limit)) {
      const target=row.href&&httpUrl(row.href,url);
      if(!target||seen.has(target)) continue;
      const parsed=new URL(target), parts=parsed.pathname.split('/').filter(Boolean);
      const valid=spec.adapter==='githubTrending'?parsed.hostname==='github.com'&&parts.length===2:
        parsed.hostname==='huggingface.co'&&(spec.adapter==='huggingFaceSpaces'?parts.length===3&&parts[0]==='spaces':parts.length===2);
      if(!valid) continue;
      const title=clean(row.title)||parts.slice(spec.adapter==='huggingFaceSpaces'?1:0).join('/');
      if(!title) continue;
      seen.add(target);
      const item={source:name,title,url:target,observedAt,placement:{listUrl:url,rank:row.rank,label:spec.adapter==='githubTrending'?'GitHub daily trending':'Hugging Face trending'},rawText:clean(row.rawText).slice(0,2000),statusHints:[]};
      if(spec.adapter==='githubTrending') {
        item.metrics={};
        for(const field of ['stars','forks']) {const value=wholeCount(row[field]);if(value!==undefined)item.metrics[field]=value;}
      }
      items.push(item);
    }
  }
  if(!items.length) throw new Error(`${key} returned zero valid inventory items; inspect access or layout`);
  return {key,status:'OK',url,observedAt,coverage:{kind:'bounded-listing',limit,description:'First listing page/top stories only; relevance and primary-source verification remain editorial work.'},items,count:items.length,actionableItems:items,actionableCount:items.length};
}
