const state={data:null,all:[]};
const $=(s)=>document.querySelector(s);
const esc=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const cut=(s='',n=34)=>String(s).length>n?String(s).slice(0,n-1)+'\u2026':String(s);

function requestedDate(){
  const value=new URLSearchParams(location.search).get('date');
  return /^\d{4}-\d{2}-\d{2}$/.test(value||'')?value:null;
}

async function loadData(){
  const date=requestedDate();
  const path=date?`data/archive/${date}.json`:'data/latest.json';
  const res=await fetch(`${path}?v=${Date.now()}`);
  if(!res.ok){
    if(date){
      history.replaceState({},'',location.pathname);
      return loadData();
    }
    throw new Error('\ube0c\ub9ac\ud551 \ub370\uc774\ud130\ub97c \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.');
  }
  const data=await res.json();
  state.data=data;
  state.all=[...(data.contests||[]),...(data.aiNews||[]),...(data.support||[])];
  render(data);
}

function render(data){
  document.title=`${data.date} | daily-brief`;
  $('#todayChip').textContent=formatLongDate(data.date);
  $('#dateLine').textContent=formatLongDate(data.date);
  $('#year').textContent=new Date().getFullYear();

  const contests=data.contests||[];
  const aiNews=data.aiNews||[];
  const support=data.support||[];
  const todayCount=contests.filter(x=>isTodayDeadline(x)).length+support.filter(x=>isTodayDeadline(x)).length;
  const weekCount=contests.filter(x=>isWithinWeek(x)).length+support.filter(x=>isWithinWeek(x)).length;

  $('#todayDeadlineCount').textContent=todayCount;
  $('#weekDeadlineCount').textContent=weekCount;
  $('#contestCount').textContent=contests.length;
  $('#supportCount').textContent=support.length;
  $('#contestCountLabel').textContent=`${contests.length}\uac74`;
  $('#supportCountLabel').textContent=`${support.length}\uac74`;
  $('#aiCountLabel').textContent=`${aiNews.length}\uac74`;

  renderSpotlight(contests,support);
  renderOpportunityList('#contestList',contests,'contest');
  renderOpportunityList('#supportList',support,'support');
  renderNewsList('#aiList',aiNews);
  renderArchive(data.archive||[]);
}

function ddayNumber(item){
  if(!item?.dDay)return null;
  if(String(item.dDay).includes('\uc624\ub298'))return 0;
  const m=String(item.dDay).match(/D-(\d+)/i);
  return m?Number(m[1]):null;
}
function isTodayDeadline(item){return ddayNumber(item)===0}
function isWithinWeek(item){
  const n=ddayNumber(item);
  return n!==null&&n>=0&&n<=7;
}

function renderSpotlight(contests,support){
  const pool=[...contests,...support].filter(Boolean);
  if(!pool.length){
    $('#heroSpotlight').innerHTML='<span class="spotlight-label">\uc624\ub298 \uba3c\uc800 \ubcfc \uac83</span><strong>\uc0c8\ub85c \ud655\uc778\ud560 \ud575\uc2ec \uc815\ubcf4\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</strong><p>\uc0c8\ub85c\uc6b4 \uacf5\uace0\ub098 \uc9c0\uc6d0\uc0ac\uc5c5\uc774 \ud655\uc778\ub418\uba74 \uc5ec\uae30\uc5d0 \uac00\uc7a5 \uba3c\uc800 \ud45c\uc2dc\ub429\ub2c8\ub2e4.</p>';
    return;
  }
  const sorted=[...pool].sort((a,b)=>{
    const da=ddayNumber(a); const db=ddayNumber(b);
    if(da===null&&db===null)return 0;
    if(da===null)return 1;
    if(db===null)return -1;
    return da-db;
  });
  const item=sorted[0];
  $('#heroSpotlight').innerHTML=`
    <span class="spotlight-label">\uc624\ub298 \uba3c\uc800 \ubcfc \uac83</span>
    <strong>${esc(item.title)}</strong>
    <p>${esc(item.summary||'')}</p>
    <div class="spotlight-meta">
      ${item.dDay?`<span>${esc(item.dDay)}</span>`:''}
      ${item.reward?`<span>${esc(cut(item.reward,24))}</span>`:''}
      ${item.participation?`<span>${esc(cut(item.participation,20))}</span>`:''}
    </div>`;
  $('#heroSpotlight').onclick=()=>openDetail(item.id);
}

function renderOpportunityList(sel,items,type){
  const el=$(sel);
  if(!items.length){
    el.innerHTML=`<div class="empty-state">\ud604\uc7ac \ud45c\uc2dc\ud560 ${type==='support'?'\uc9c0\uc6d0\uc0ac\uc5c5':'\uacf5\ubaa8\uc804\u00b7\ud574\ucee4\ud1a4'}\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.<br>\uc0c8\ub85c\uc6b4 \uc815\ubcf4\uac00 \ud655\uc778\ub418\uba74 \uc790\ub3d9\uc73c\ub85c \ucd94\uac00\ub429\ub2c8\ub2e4.</div>`;
    return;
  }
  el.innerHTML=items.map(item=>`
    <article class="opportunity-card" data-id="${esc(item.id)}">
      <div class="opportunity-top">
        <div class="opportunity-badges">
          ${item.dDay?`<span class="status-badge">${esc(item.dDay)}</span>`:''}
          <span class="soft-badge">${esc(item.categoryLabel|| (type==='support'?'\uc9c0\uc6d0\uc0ac\uc5c5':'\uacf5\ubaa8\uc804\u00b7\ud574\ucee4\ud1a4'))}</span>
          ${item.deadlineText?`<span class="soft-badge">\ub9c8\uac10 ${esc(item.deadlineText)}</span>`:''}
        </div>
        <h3>${esc(item.title)}</h3>
        <p class="opportunity-summary">${esc(item.summary||'')}</p>
      </div>
      <div class="key-facts">
        <div class="fact"><b>\ub9c8\uac10</b><span>${esc(item.deadlineText||item.dDay||'\ud655\uc778 \ud544\uc694')}</span></div>
        <div class="fact"><b>${type==='support'?'\uc9c0\uc6d0 / \ud61c\ud0dd':'\uc0c1\uae08 / \ubcf4\uc0c1'}</b><span>${esc(cut(item.reward||item.aiSupport||'\ud655\uc778 \ud544\uc694',46))}</span></div>
        <div class="fact"><b>\ucc38\uac00</b><span>${esc(cut(item.participation||'\ud655\uc778 \ud544\uc694',42))}</span></div>
        <div class="fact"><b>\uc608\ube44\ucc3d\uc5c5\uc790</b><span>${esc(cut(item.preStartup||'\ud655\uc778 \ud544\uc694',42))}</span></div>
      </div>
      <div class="card-footer">
        <div class="tag-row">${(item.tags||[]).slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
        <button type="button" class="detail-button">\uc0c1\uc138 \ubcf4\uae30</button>
      </div>
    </article>`).join('');
  el.querySelectorAll('.opportunity-card').forEach(card=>{
    card.addEventListener('click',e=>{
      if(e.target.closest('a'))return;
      openDetail(card.dataset.id);
    });
  });
}

function renderNewsList(sel,items){
  const el=$(sel);
  if(!items.length){
    el.innerHTML='<div class="empty-state">\uc624\ub298 \ub4f1\ub85d\ub41c AI \ub274\uc2a4\uac00 \uc544\uc9c1 \uc5c6\uc2b5\ub2c8\ub2e4.<br>AI \ube0c\ub9ac\ud551 \uc790\ub3d9\ud654\uac00 \uc2e4\ud589\ub418\uba74 \uc5ec\uae30\uc5d0 \uc911\uc694\ud55c \uc18c\uc2dd\uc774 \ucd94\uac00\ub429\ub2c8\ub2e4.</div>';
    return;
  }
  el.innerHTML=items.map(item=>`
    <article class="news-card" data-id="${esc(item.id)}">
      <span class="news-time">${esc(item.updatedAgo||'\uc624\ub298')}</span>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.summary||'')}</p>
      ${item.description?`<div class="news-why"><b>\uc65c \ubd10\uc57c \ud574?</b><br>${esc(cut(item.description,110))}</div>`:''}
      <div class="card-footer">
        <div class="tag-row">${(item.tags||[]).slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
        <button type="button" class="detail-button">\uc790\uc138\ud788</button>
      </div>
    </article>`).join('');
  el.querySelectorAll('.news-card').forEach(card=>card.addEventListener('click',()=>openDetail(card.dataset.id)));
}

function renderArchive(days){
  const el=$('#archiveDays');
  const current=state.data?.date;
  el.innerHTML=days.slice(0,12).map(d=>{
    const date=new Date(`${d}T00:00:00+09:00`);
    const weekday=['\uc77c','\uc6d4','\ud654','\uc218','\ubaa9','\uae08','\ud1a0'][date.getDay()];
    return `<button class="archive-day ${d===current?'active':''}" data-date="${d}">
      <small>${date.getMonth()+1}\uc6d4</small><strong>${date.getDate()}</strong><small>${weekday}</small>
    </button>`;
  }).join('')||'<span class="empty-state">\uc544\uce74\uc774\ube0c\uac00 \uc313\uc774\uba74 \uc5ec\uae30\uc5d0 \ud45c\uc2dc\ub429\ub2c8\ub2e4.</span>';
  el.querySelectorAll('.archive-day').forEach(btn=>btn.addEventListener('click',()=>{
    const next=new URLÿñ±½Ñ¥½¸¹¡É¤ì(¹áÐ¹ÍÉ¡AÉµÌ¹ÍÐ Ñ±Ñ¸¹ÑÍÐ¹Ñ¤ì(±½Ñ¥½¸¹¡Éõ¹áÐ¹Ñ½MÑÉ¥¹ ¤ì(ô¤¤ì)ô()Õ¹Ñ¥½¸½Á¹Ñ¥°¡¥¥ì(½¹ÍÐ¥Ñ´õÍÑÑ¹±°¹¥¹¡àôùà¹¥ôôõ¥¤ì(¥ ¥Ñ´¥ÉÑÕÉ¸ì((½¹ÍÐ±¥¥¥±¥Ñäõl(lqÕÝqÕåÅqÕÜäÀqÔÀÁÜqÕáqÕÕÔ±¥Ñ´¹µÁ±½åµ¹Ñt°(lqÕÁqÕÕÕqÕÜäÁqÕÑÅqÕàÕ±¥Ñ´¹ÕÍ¥¹ÍÍI¥ÍÑÉÑ¥½¹t(t¹¥±ÑÈ ¡l±Ùt¤ôùØ¤ì((½¹ÍÐÁÉ½ÍÌõl(lqÕàÄÅqÕÈÄà¼qÕåÑqÕÔàäqÕÜÝqÕàÄÔ±¥Ñ´¹ÁÉ¥½t°(lqÕÍåqÕÀÁqÕÈåqÕÉ±¥Ñ´¹Ù±ÕÑ¥½¹t°(l$¼qÕÀÜÑqÕÜÝqÕÙÁqÕÑqÕåÁqÕÙÀ±¥Ñ´¹¥MÕÁÁ½ÉÑt(t¹¥±ÑÈ ¡l±Ùt¤ôùØ¤ì((½¹ÍÐ¥Ìõ¥Ñ´¹¥Íññmtì(½¹ÍÐ±¥¹­Ìõ¥Ñ´¹±¥¹­Íññmtì(( ¥±½½¹Ñ¹Ð¤¹¥¹¹É!Q50õ(ñ¥Ø±ÍÌôÑ¥°µÍ¡±°ø(ñÍÑ¥½¸±ÍÌôÑ¥°µ¡É¼ø(ñ¥Ø±ÍÌôÑ¥°µÌø(í¥Ñ´¹äýñÍÁ¸±ÍÌôÍÑÑÕÌµøíÍ¡¥Ñ´¹ä¥ôð½ÍÁ¸ùèô(ñÍÁ¸±ÍÌôÍ½ÐµøíÍ¡¥Ñ´¹Ñ½Éå1±ñðqÕÁqÕåqÕÔÔÄ¥ôð½ÍÁ¸ø(í¥Ñ´¹±¥¹QáÐýñÍÁ¸±ÍÌôÍ½ÐµùqÕåáqÕÄÀíÍ¡¥Ñ´¹±¥¹QáÐ¥ôð½ÍÁ¸ùèô(ð½¥Øø(ñ ÈøíÍ¡¥Ñ´¹Ñ¥Ñ±¥ôð½ Èø(ñÀ±ÍÌôÑ¥°µÍÕµµÉäøíÍ¡¥Ñ´¹ÍÉ¥ÁÑ¥½¹ññ¥Ñ´¹ÍÕµµÉåñð¥ôð½Àø(ñ¥Ø±ÍÌô¥Í¥½¸µÉ¥ø(ñ¥Ø±ÍÌô¥Í¥½¸µÉøñùqÕåáqÕÄÀð½øñÍÁ¸øíÍ¡¥Ñ´¹±¥¹QáÑññ¥Ñ´¹åñðqÕØÔÕqÕÜÜàqÕÔÐÑqÕØäÐ¥ôð½ÍÁ¸øð½¥Øø(ñ¥Ø±ÍÌô¥Í¥½¸µÉøñùqÕÁÅqÕÀà¼qÕÑqÕÁÄð½øñÍÁ¸øíÍ¡ÕÐ¡¥Ñ´¹ÉÝÉñðqÕØÔÕqÕÜÜàqÕÔÐÑqÕØäÐ°Ôà¤¥ôð½ÍÁ¸øð½¥Øø(ñ¥Ø±ÍÌô¥Í¥½¸µÉøñùqÕÌáqÕÀÀð½øñÍÁ¸øíÍ¡ÕÐ¡¥Ñ´¹ÁÉÑ¥¥ÁÑ¥½¹ñðqÕØÔÕqÕÜÜàqÕÔÐÑqÕØäÐ°Ðà¤¥ôð½ÍÁ¸øð½¥Øø(ñ¥Ø±ÍÌô¥Í¥½¸µÉøñùqÕØÀáqÕÐÑqÕÍqÕÕÕqÕÜäÀð½øñÍÁ¸øíÍ¡ÕÐ¡¥Ñ´¹ÁÉMÑÉÑÕÁñðqÕØÔÕqÕÜÜàqÕÔÐÑqÕØäÐ°Ðà¤¥ôð½ÍÁ¸øð½¥Øø(ð½¥Øø(ð½ÍÑ¥½¸ø((ñÍÑ¥½¸±ÍÌôÑ¥°µÍÑ¥½¸ø(ñ ÌùqÕÁÑqÕÀÀqÕåÁqÕÙÀqÕÀÁqÕÉÕqÕÔÕqÕåÀð½ Ìø(ñÀ±ÍÌôÍÑ¥½¸µ¹½ÑùqÕÝqÕåÅqÔÀÁÝqÕáqÕÕÕqÕqÕÁqÕÕÕqÕÜäÀqÕàÜÁqÕÜÑqÕÜÐÐqÕÍqÕàÀÀqÕØÔÕqÕÜÜáqÕÔÔáqÕÄÌáqÕØäÐ¸ð½Àø(ñ¥Ø±ÍÌôÑ¥°µÉ¥ø(í±¥¥¥±¥Ñä¹±¹Ñ ý±¥¥¥±¥Ñä¹µÀ ¡m¬±Ùt¤ôùñ¥Ø±ÍÌôÑ¥°µ½àøñøíÍ¡¬¥ôð½øñÍÁ¸øíÍ¡Ø¥ôð½ÍÁ¸øð½¥Øù¤¹©½¥¸ ¤èñ¥Ø±ÍÌôÑ¥°µ½àøñùqÕàÜÁqÕÜÐð½øñÍÁ¸ùqÕÕqÕÉqÕÕqÕÁqÕÕÁqÕÄÅqÕäÑqÕÀÀqÕØÔÕqÕÜÜáqÕÜÜÐqÕÔÐÑqÕØäÑqÕÔØåqÕÉáqÕÉÐ¸ð½ÍÁ¸øð½¥Øøô(ð½¥Øø(ð½ÍÑ¥½¸ø((ñÍÑ¥½¸±ÍÌôÑ¥°µÍÑ¥½¸ø(ñ ÌùqÕåÑqÕÔàäqÕÈåqÕÉqÕqÕåÁqÕÙÀð½ Ìø(ñ¥Ø±ÍÌôÑ¥°µÉ¥ø(íÁÉ½ÍÌ¹±¹Ñ ýÁÉ½ÍÌ¹µÀ ¡m¬±Ùt¤ôùñ¥Ø±ÍÌôÑ¥°µ½àøñøíÍ¡¬¥ôð½øñÍÁ¸øíÍ¡Ø¥ôð½ÍÁ¸øð½¥Øù¤¹©½¥¸ ¤èñ¥Ø±ÍÌôÑ¥°µ½àøñùqÕåÑqÕÔàäqÕÈåqÕÉð½øñÍÁ¸ùqÕÕqÕÉqÕÕqÕÁqÕÕÁqÕÄÅqÕäÑqÕÀÀqÕØÔÕqÕÜÜáqÕÜÜÐqÕÔÐÑqÕØäÑqÕÔØåqÕÉáqÕÉÐ¸ð½ÍÁ¸øð½¥Øøô(ð½¥Øø(ð½ÍÑ¥½¸ø((í¥Ì¹±¹Ñ ý(ñÍÑ¥½¸±ÍÌôÑ¥°µÍÑ¥½¸ø(ñ ÌùqÕÜÜÐqÕÕqÕÁqÕàÕqÕÄÑqÕàÕqÕåqÕÑÐqÕÈÄàqÕÜàáqÕÈäÐ5Y@ð½ Ìø(ñÀ±ÍÌôÍÑ¥½¸µ¹½ÑùqÕÀÜÀqÕÌÁqÕØáqÕÑqÕÉÐqÕáqÕåÁqÕÕÀqÕÉqÕÜäÅqÕÔØÀqÕÈÄàqÕÜàáqÕÈäÐqÕÀÙqÕÌÁqÕàÕqÕàÄÕqÕåqÕÔàáqÕÉÕqÕÉáqÕÉÐ¸ð½Àø(ñ¥Ø±ÍÌô¥µÉ¥ø(í¥Ì¹µÀ ¡¥±¤¤ôùñÉÑ¥±±ÍÌô¥µÉøñÍÑÉ½¹ùqÕÔÐÑqÕÜÜÑqÕÔÄÑqÕÕÐí¤¬Åôð½ÍÑÉ½¹øñÀøíÍ¡¥¥ôð½Àøð½ÉÑ¥±ù¤¹©½¥¸ ¥ô(ð½¥Øø(ð½ÍÑ¥½¸ùèô((ñ¥Ø±ÍÌôÑ¥°µÑ¥½¹Ìø(í±¥¹­Ì¹µÀ ¡°±¤¤ôùñ±ÍÌôí¤øÀüÍ½¹Éäµ±¥¹¬èô¡ÉôíÍ¡°¹ÕÉ°¥ôÑÉÐô}±¹¬É°ô¹½½Á¹È¹½ÉÉÉÈøíÍ¡°¹±°¥ôqÔÈÄäÜð½ù¤¹©½¥¸ ¥ô(ð½¥Øø(ð½¥Øùì( Ñ¥±¥±½¤¹Í¡½Ý5½° ¤ì)ô()Õ¹Ñ¥½¸½ÉµÑ1½¹Ñ¡Ì¥ì(½¹ÍÐõ¹ÜÑ¡íÍõPÀÀèÀÀèÀÀ¬ÀäèÀÁ¤ì(½¹ÍÐÜõlqÕÜÝ°qÕÙÐ°qÕØÔÐ°qÕÈÄà°qÕä°qÕÀà°qÕÅÀum¹Ñä ¥tì(ÉÑÕÉ¸í¹ÑÕ±±eÈ ¥õqÕÄÐÐí¹Ñ5½¹Ñ  ¤¬ÅõqÕÙÐí¹ÑÑ ¥õqÕÜÝ íÝô¥ì)ô()Õ¹Ñ¥½¸ÍÑÕÁ¥±½Ì ¥ì(½Õµ¹Ð¹ÅÕÉåM±Ñ½É±° ¹¥±½µ±½Í¤¹½É ¡Ñ¸ôùÑ¸¹Ù¹Ñ1¥ÍÑ¹È ±¥¬° ¤ôùÑ¸¹±½ÍÍÐ ¥±½¤¹±½Í ¤¤¤ì(½Õµ¹Ð¹ÅÕÉåM±Ñ½É±° ¥±½¤¹½É ¡ôù¹Ù¹Ñ1¥ÍÑ¹È ±¥¬±ôùí¥¡¹ÑÉÐôôõ¥¹±½Í ¥ô¤¤ì( ÍÉ¡	ÕÑÑ½¸¤¹Ù¹Ñ1¥ÍÑ¹È ±¥¬° ¤ôùì( ÍÉ¡¥±½¤¹Í¡½Ý5½° ¤ì(ÍÑQ¥µ½ÕÐ  ¤ôø ÍÉ¡%¹ÁÕÐ¤¹½ÕÌ ¤°ÄÀÀ¤ì(ô¤ì( ÍÉ¡%¹ÁÕÐ¤¹Ù¹Ñ1¥ÍÑ¹È ¥¹ÁÕÐ±ôùì(½¹ÍÐÄõ¹ÑÉÐ¹Ù±Õ¹ÑÉ¥´ ¤¹Ñ½1½ÝÉÍ ¤ì(½¹ÍÐÉÍÕ±ÑÌõÄýÍÑÑ¹±°¹¥±ÑÈ¡àôùmà¹Ñ¥Ñ±±à¹ÍÕµµÉä±à¹ÍÉ¥ÁÑ¥½¸°¸¸¸¡à¹ÑÍññmt¥t¹©½¥¸ ¤¹Ñ½1½ÝÉÍ ¤¹¥¹±ÕÌ¡Ä¤¤¹Í±¥ À°ÄÈ¤émtì( ÍÉ¡IÍÕ±ÑÌ¤¹¥¹¹É!Q50õÉÍÕ±ÑÌ¹µÀ¡àôù(ñ¥Ø±ÍÌôÍÉ µÉÍÕ±ÐÑµ¥ôíÍ¡à¹¥¥ôø(ñøíÍ¡à¹Ñ¥Ñ±¥ôð½ø(ñÍÁ¸øíÍ¡à¹ÍÕµµÉåñð¥ôð½ÍÁ¸ø(ð½¥Øù¤¹©½¥¸ ¥ñð¡Äüñ¥Ø±ÍÌôµÁÑäµÍÑÑùqÕàÁqÕÁäqÕÁqÕqÕÀÀqÕÕÙqÕÉÕqÕÉáqÕÉÐ¸ð½¥Øøè¤ì( ÍÉ¡IÍÕ±ÑÌ¤¹ÅÕÉåM±Ñ½É±° ¹ÍÉ µÉÍÕ±Ð¤¹½É ¡ÈôùÈ¹Ù¹Ñ1¥ÍÑ¹È ±¥¬° ¤ôùì( ÍÉ¡¥±½¤¹±½Í ¤ì(½Á¹Ñ¥°¡È¹ÑÍÐ¹¥¤ì(ô¤¤ì(ô¤ì)ô()ÍÑÕÁ¥±½Ì ¤ì)±½Ñ ¤¹Ñ ¡ÉÈôùì(½¹Í½±¹ÉÉ½È¡ÉÈ¤ì(½Õµ¹Ð¹ÅÕÉåM±Ñ½È µ¥¸¤¹¥¹¹É!Q50õñ¥Ø±ÍÌôµÁÑäµÍÑÑøíÍ¡ÉÈ¹µÍÍ¥ôð½¥Øùì)ô¤ìÿÿÿ