const state = { data: null, all: [] };
const $ = (s) => document.querySelector(s);
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function loadData() {
  const res = await fetch(`data/latest.json?v=${Date.now()}`);
  if (!res.ok) throw new Error('브리핑 데이터를 불러오지 못했습니다.');
  const data = await res.json();
  state.data = data;
  state.all = [...(data.contests||[]), ...(data.aiNews||[]), ...(data.support||[])];
  render(data);
}

function render(data) {
  document.title = `${data.date} | daily-brief`;
  $('#todayChip').textContent = formatLongDate(data.date);
  $('#dateLine').textContent = `▣ ${formatLongDate(data.date)}`;
  $('#year').textContent = new Date().getFullYear();
  renderList('#contestList', data.contests || [], 'contest');
  renderList('#aiList', data.aiNews || [], 'ai');
  renderList('#supportList', data.support || [], 'support');
  $('#contestCount').textContent = `${(data.contests||[]).length}건`;
  $('#aiCount').textContent = `${(data.aiNews||[]).length}건`;
  $('#supportCount').textContent = `${(data.support||[]).length}건`;
  renderArchive(data.archive || []);
}

function renderList(sel, items, type) {
  const el = $(sel);
  if (!items.length) {
    el.innerHTML = `<div class="empty-state">오늘 등록된 ${type==='ai'?'AI 뉴스':type==='support'?'지원사업':'공모전'}가 아직 없어요.<br>새로운 정보가 확인되면 자동으로 추가됩니다.</div>`;
    return;
  }
  el.innerHTML = items.slice(0,3).map((item, idx) => `
    <div class="brief-item" data-id="${esc(item.id)}">
      <div class="thumb">${esc(item.icon || iconFor(type, idx))}</div>
      <div class="item-body">
        <div class="meta-row">
          ${item.dDay ? `<span class="deadline">${esc(item.dDay)}</span>` : item.isNew ? '<span class="new-badge">NEW</span>' : ''}
          ${item.updatedAgo ? `<span>${esc(item.updatedAgo)}</span>` : ''}
          ${item.deadlineText ? `<span class="item-date">${esc(item.deadlineText)}</span>` : ''}
        </div>
        <h4 class="item-title">${esc(item.title)}</h4>
        <p class="item-summary">${esc(item.summary || '')}</p>
        <div class="tags">${(item.tags||[]).slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>
    </div>`).join('');
  el.querySelectorAll('.brief-item').forEach(node => node.addEventListener('click', () => openDetail(node.dataset.id)));
}

function iconFor(type, idx) {
  return type === 'contest' ? ['🏆','💡','🤖'][idx%3] : type === 'ai' ? ['✦','AI','◈'][idx%3] : ['🏢','↗','₩'][idx%3];
}

function renderArchive(days) {
  const el = $('#archiveDays');
  el.innerHTML = days.slice(0,8).map((d,i) => {
    const date = new Date(`${d}T00:00:00+09:00`);
    const weekday = ['일','월','화','수','목','금','토'][date.getDay()];
    return `<button class="archive-day ${i===0?'active':''}" data-date="${d}"><small>${date.getMonth()+1}월</small><strong>${date.getDate()}</strong><small>${weekday}</small></button>`;
  }).join('') || '<span class="empty-state">아카이브가 쌓이면 여기에 표시됩니다.</span>';
  el.querySelectorAll('.archive-day').forEach(btn=>btn.addEventListener('click',()=>location.href=`?date=${btn.dataset.date}`));
}

function openDetail(id) {
  const item = state.all.find(x => x.id === id);
  if (!item) return;
  const fields = [
    ['참가기간', item.period], ['총상금 / 보상', item.reward], ['참가', item.participation],
    ['예비창업자', item.preStartup], ['재직자 · 겸업', item.employment], ['사업자등록', item.businessRegistration],
    ['평가방식', item.evaluation], ['AI / 클라우드 지원', item.aiSupport]
  ].filter(([,v])=>v);
  $('#dialogContent').innerHTML = `<div class="detail-inner">
    <div class="meta-row">${item.dDay?`<span class="deadline">${esc(item.dDay)}</span>`:''}<span>${esc(item.categoryLabel||'브리핑')}</span></div>
    <h2>${esc(item.title)}</h2>
    <p class="detail-summary">${esc(item.description || item.summary || '')}</p>
    <div class="detail-grid">${fields.map(([k,v])=>`<div class="detail-box"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>
    ${(item.ideas||[]).length?`<div class="detail-ideas"><h3>어떤 걸 해볼까?</h3><ul>${item.ideas.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    <div class="official-links">${(item.links||[]).map(l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join('')}</div>
  </div>`;
  $('#detailDialog').showModal();
}

function formatLongDate(s) {
  const d = new Date(`${s}T00:00:00+09:00`);
  const w = ['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${w})`;
}

function setupDialogs() {
  document.querySelectorAll('.dialog-close').forEach(btn=>btn.addEventListener('click',()=>btn.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{ if(e.target===d)d.close(); }));
  $('#searchButton').addEventListener('click',()=>{ $('#searchDialog').showModal(); setTimeout(()=>$('#searchInput').focus(),100); });
  $('#searchInput').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const results = q ? state.all.filter(x=>[x.title,x.summary,...(x.tags||[])].join(' ').toLowerCase().includes(q)).slice(0,12) : [];
    $('#searchResults').innerHTML = results.map(x=>`<div class="search-result" data-id="${esc(x.id)}"><b>${esc(x.title)}</b><span>${esc(x.summary||'')}</span></div>`).join('') || (q?'<div class="empty-state">검색 결과가 없습니다.</div>':'');
    $('#searchResults').querySelectorAll('.search-result').forEach(r=>r.addEventListener('click',()=>{ $('#searchDialog').close();openDetail(r.dataset.id); }));
  });
}

setupDialogs();
loadData().catch(err => {
  console.error(err);
  document.querySelector('.brief-grid').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
});
