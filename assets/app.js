
const state = { data: null, all: [], currentId: null };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const text = (s, fallback = "확인 필요") => {
  const v = String(s == null ? "" : s).trim();
  return v || fallback;
};
const cut = (s, n) => {
  const v = text(s, "");
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
};

function requestedDate() {
  const v = new URLSearchParams(location.search).get("date");
  return /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null;
}

function ddayNumber(item) {
  if (!item || !item.dDay) return null;
  const v = String(item.dDay);
  if (v.includes("오늘")) return 0;
  const m = v.match(/D-(\d+)/i);
  return m ? Number(m[1]) : null;
}

function isToday(item) { return ddayNumber(item) === 0; }
function withinWeek(item) {
  const n = ddayNumber(item);
  return n !== null && n >= 0 && n <= 7;
}
function statusClass(item) { return isToday(item) ? "danger" : ""; }

async function loadData() {
  const date = requestedDate();
  const path = date ? "data/archive/" + date + ".json" : "data/latest.json";
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) throw new Error("브리핑 데이터를 불러오지 못했습니다.");
  const data = await res.json();

  state.data = data;
  state.all = [].concat(data.contests || [], data.aiNews || [], data.support || []);
  renderHome();
  bindHashRoute();
}

function formatDate(s) {
  const d = new Date(s + "T00:00:00+09:00");
  const w = ["일","월","화","수","목","금","토"][d.getDay()];
  return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + w + "요일";
}

function renderHome() {
  const data = state.data;
  const contests = data.contests || [];
  const news = data.aiNews || [];
  const support = data.support || [];

  $("#topbarDate").textContent = formatDate(data.date);
  $("#year").textContent = new Date().getFullYear();
  $("#todayDeadlineCount").textContent = contests.filter(isToday).length + support.filter(isToday).length;
  $("#weekDeadlineCount").textContent = contests.filter(withinWeek).length + support.filter(withinWeek).length;
  $("#contestCount").textContent = contests.length;
  $("#aiCount").textContent = news.length;
  $("#contestCountLabel").textContent = contests.length + "건";
  $("#aiCountLabel").textContent = news.length + "건";
  $("#supportCountLabel").textContent = support.length + "건";

  renderFeatured(contests, support);
  renderOpportunityFeed("#contestList", contests, "contest");
  renderNews("#aiList", news);
  renderOpportunityFeed("#supportList", support, "support");
  renderArchive(data.archive || []);

  const supportSection = $("#support");
  const supportNav = $("#supportNav");
  if (support.length === 0) {
    supportSection.hidden = true;
    supportNav.hidden = true;
  } else {
    supportSection.hidden = false;
    supportNav.hidden = false;
  }
}

function renderFeatured(contests, support) {
  const pool = [].concat(contests, support);
  const el = $("#featuredOpportunity");

  if (!pool.length) {
    el.innerHTML = '<div class="featured-inner"><div><div class="featured-kicker"><span class="featured-meta">오늘</span></div><h3 class="featured-title">지금 바로 확인할 공고가 없습니다.</h3><p class="featured-summary">조건에 맞는 새 공고가 확인되면 여기에 가장 먼저 표시됩니다.</p></div></div>';
    return;
  }

  const sorted = pool.slice().sort((a, b) => {
    const da = ddayNumber(a), db = ddayNumber(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  const item = sorted[0];
  const cat = String(item.categoryLabel || "").includes("지원사업") ? "지원사업" : "공모전 · 해커톤";

  el.dataset.id = item.id;
  el.innerHTML =
    '<div class="featured-inner">' +
      '<div>' +
        '<div class="featured-kicker">' +
          (item.dDay ? '<span class="featured-badge ' + statusClass(item) + '">' + esc(item.dDay) + '</span>' : '') +
          '<span class="featured-meta">' + esc(cat) + '</span>' +
        '</div>' +
        '<h3 class="featured-title">' + esc(item.title) + '</h3>' +
        '<p class="featured-summary">' + esc(item.summary || '') + '</p>' +
        '<span class="featured-cta">상세 보기 →</span>' +
      '</div>' +
      '<div class="featured-side">' +
        '<dl>' +
          '<div><dt>마감</dt><dd>' + esc(text(item.deadlineText || item.dDay)) + '</dd></div>' +
          '<div><dt>' + (cat === "지원사업" ? "지원 / 혜택" : "상금 / 보상") + '</dt><dd>' + esc(cut(item.reward || item.aiSupport, 60)) + '</dd></div>' +
          '<div><dt>' + (cat === "지원사업" ? "지원 대상" : "참가") + '</dt><dd>' + esc(cut(item.participation, 54)) + '</dd></div>' +
        '</dl>' +
      '</div>' +
    '</div>';

  el.onclick = () => openDetail(item.id);
}

function renderOpportunityFeed(sel, items, type) {
  const el = $(sel);
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">현재 조건에 맞는 정보가 없습니다.</div>';
    return;
  }

  el.innerHTML = items.map(item => {
    const category = type === "support" ? "지원사업" : "공모전 · 해커톤";
    return '<article class="feed-item" data-id="' + esc(item.id) + '">' +
      '<div class="feed-main">' +
        '<div class="feed-topline">' +
          (item.dDay ? '<span class="feed-status ' + statusClass(item) + '">' + esc(item.dDay) + '</span>' : '') +
          '<span class="feed-category">' + category + '</span>' +
        '</div>' +
        '<h3 class="feed-title">' + esc(item.title) + '</h3>' +
        '<p class="feed-summary">' + esc(item.summary || '') + '</p>' +
      '</div>' +
      '<div class="feed-side">' +
        '<div><span>마감</span><strong>' + esc(text(item.deadlineText || item.dDay)) + '</strong></div>' +
        '<div><span>' + (type === "support" ? "지원" : "상금") + '</span><strong>' + esc(cut(item.reward || item.aiSupport, 42)) + '</strong></div>' +
      '</div>' +
      '<div class="feed-arrow">→</div>' +
    '</article>';
  }).join('');

  el.querySelectorAll(".feed-item").forEach(row => {
    row.addEventListener("click", () => openDetail(row.dataset.id));
  });
}

function renderNews(sel, items) {
  const el = $(sel);
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">오늘 표시할 AI 뉴스가 없습니다.</div>';
    return;
  }

  el.innerHTML = items.slice(0, 6).map(item =>
    '<article class="news-item" data-id="' + esc(item.id) + '">' +
      '<div class="news-item-meta"><span>AI NEWS</span><span>' + esc(item.updatedAgo || "오늘") + '</span></div>' +
      '<h3>' + esc(item.title) + '</h3>' +
      '<p>' + esc(item.summary || '') + '</p>' +
      '<div class="why">왜 볼까? ' + esc(cut(item.why || item.description || item.summary, 64)) + '</div>' +
    '</article>'
  ).join('');

  el.querySelectorAll(".news-item").forEach(row => {
    row.addEventListener("click", () => openDetail(row.dataset.id));
  });
}

function renderArchive(days) {
  const el = $("#archiveDays");
  const current = state.data.date;
  el.innerHTML = days.slice(0, 14).map(d => {
    const date = new Date(d + "T00:00:00+09:00");
    const week = ["일","월","화","수","목","금","토"][date.getDay()];
    return '<button class="archive-day ' + (d === current ? "active" : "") + '" data-date="' + d + '">' +
      '<small>' + (date.getMonth() + 1) + '월</small>' +
      '<strong>' + date.getDate() + '</strong>' +
      '<small>' + week + '</small>' +
    '</button>';
  }).join('');

  el.querySelectorAll(".archive-day").forEach(btn => {
    btn.addEventListener("click", () => {
      const u = new URL(location.href);
      u.searchParams.set("date", btn.dataset.date);
      u.hash = "";
      location.href = u.toString();
    });
  });
}

function openDetail(id, push = true) {
  const item = state.all.find(x => x.id === id);
  if (!item) return;

  state.currentId = id;
  renderDetail(item);

  $("#homeView").hidden = true;
  $("#detailView").hidden = false;
  window.scrollTo({ top: 0, behavior: "instant" });

  if (push) history.pushState({ id }, "", "#item=" + encodeURIComponent(id));
}

function renderDetail(item) {
  const isNews = (state.data.aiNews || []).some(x => x.id === item.id);
  if (isNews) renderNewsDetail(item);
  else renderOpportunityDetail(item);
}

function renderOpportunityDetail(item) {
  const isSupport = String(item.categoryLabel || "").includes("지원사업");
  const category = isSupport ? "지원사업" : "공모전 · 해커톤";
  const header = $("#detailHeader");
  const actions = $("#detailTopActions");
  const body = $("#detailContent");
  const aside = $("#detailAside");

  header.innerHTML =
    '<div class="detail-kicker">' +
      (item.dDay ? '<span class="detail-pill ' + statusClass(item) + '">' + esc(item.dDay) + '</span>' : '') +
      '<span class="detail-pill">' + category + '</span>' +
    '</div>' +
    '<h1>' + esc(item.title) + '</h1>' +
    '<p>' + esc(item.description || item.summary || '') + '</p>';

  const links = item.links || [];
  actions.innerHTML = links.slice(0,2).map((l,i) =>
    '<a class="' + (i === 0 ? "primary-link" : "secondary-link") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' ↗</a>'
  ).join('');

  const info = [
    ["접수 / 일정", item.period],
    ["참가 / 대상", item.participation],
    ["상금 / 지원", item.reward]
  ].filter(x => x[1]);

  const eligibility = [
    ["예비창업자", item.preStartup],
    ["재직자 · 겸업", item.employment],
    ["사업자등록", item.businessRegistration]
  ].filter(x => x[1]);

  const process = [
    ["평가방식", item.evaluation],
    ["AI / 클라우드 지원", item.aiSupport]
  ].filter(x => x[1]);

  const ideas = item.ideas || [];

  body.innerHTML =
    block("핵심 정보", "신청 전에 가장 먼저 확인할 내용입니다.", info) +
    block("지원 자격", "내가 실제로 신청 가능한지 확인합니다.", eligibility) +
    block("진행 방식", "", process) +
    (ideas.length ? ideaBlock(ideas) : "");

  aside.innerHTML =
    '<div class="aside-card">' +
      '<div class="aside-status">' +
        '<strong class="' + statusClass(item) + '">' + esc(item.dDay || "Open") + '</strong>' +
        '<span>마감 ' + esc(text(item.deadlineText || item.period)) + '</span>' +
      '</div>' +
      '<div class="aside-facts">' +
        fact("분류", category) +
        fact(isSupport ? "지원 / 혜택" : "상금 / 보상", cut(item.reward || item.aiSupport, 74)) +
        fact(isSupport ? "지원 대상" : "참가", cut(item.participation, 74)) +
      '</div>' +
      (links.length ? '<div class="aside-links">' + links.map(l => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><span>' + esc(l.label) + '</span><span>↗</span></a>').join('') + '</div>' : '') +
    '</div>';
}

function renderNewsDetail(item) {
  const header = $("#detailHeader");
  const actions = $("#detailTopActions");
  const body = $("#detailContent");
  const aside = $("#detailAside");
  const links = item.links || [];
  const ideas = item.ideas || [];

  header.innerHTML =
    '<div class="detail-kicker"><span class="detail-pill">AI NEWS</span>' +
      (item.updatedAgo ? '<span class="detail-pill">' + esc(item.updatedAgo) + '</span>' : '') +
    '</div>' +
    '<h1>' + esc(item.title) + '</h1>' +
    '<p>' + esc(item.summary || '') + '</p>';

  actions.innerHTML = links.slice(0,2).map((l,i) =>
    '<a class="' + (i === 0 ? "primary-link" : "secondary-link") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' ↗</a>'
  ).join('');

  body.innerHTML =
    '<section class="detail-block"><h2>무슨 일이야?</h2><div class="info-table"><dl class="info-row"><dt>핵심</dt><dd>' + esc(item.description || item.summary || '') + '</dd></dl></div></section>' +
    '<section class="detail-block"><h2>왜 봐야 해?</h2><div class="info-table"><dl class="info-row"><dt>의미</dt><dd>' + esc(item.why || item.description || item.summary || '') + '</dd></dl></div></section>' +
    (ideas.length ? newsIdeaBlock(ideas) : '');

  aside.innerHTML =
    '<div class="aside-card">' +
      '<div class="aside-status"><strong>AI</strong><span>' + esc(item.updatedAgo || "오늘") + '</span></div>' +
      '<div class="aside-facts">' +
        fact("분류", (item.tags || []).slice(0,3).join(" · ") || "AI 뉴스") +
      '</div>' +
      (links.length ? '<div class="aside-links">' + links.map(l => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><span>' + esc(l.label) + '</span><span>↗</span></a>').join('') + '</div>' : '') +
    '</div>';
}

function block(title, desc, rows) {
  if (!rows.length) return "";
  return '<section class="detail-block">' +
    '<h2>' + esc(title) + '</h2>' +
    (desc ? '<p class="block-desc">' + esc(desc) + '</p>' : '') +
    '<div class="info-table">' +
      rows.map(r => '<dl class="info-row"><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></dl>').join('') +
    '</div>' +
  '</section>';
}

function ideaBlock(ideas) {
  return '<section class="detail-block"><h2>뭘 만들어볼까?</h2><p class="block-desc">주말 MVP 수준으로 시작할 수 있는 아이디어입니다.</p><div class="idea-list">' +
    ideas.map((v,i) => '<div class="idea-item"><span class="idea-index">' + (i+1) + '</span><p>' + esc(v) + '</p></div>').join('') +
  '</div></section>';
}

function newsIdeaBlock(ideas) {
  return '<section class="detail-block"><h2>어떻게 써볼까?</h2><div class="idea-list">' +
    ideas.map((v,i) => '<div class="idea-item"><span class="idea-index">' + (i+1) + '</span><p>' + esc(v) + '</p></div>').join('') +
  '</div></section>';
}

function fact(label, value) {
  return '<div class="aside-fact"><span>' + esc(label) + '</span><strong>' + esc(text(value)) + '</strong></div>';
}

function showHome(push = true) {
  state.currentId = null;
  $("#detailView").hidden = true;
  $("#homeView").hidden = false;
  if (push) history.pushState({}, "", location.pathname + location.search);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function bindHashRoute() {
  const m = location.hash.match(/^#item=(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (state.all.some(x => x.id === id)) openDetail(id, false);
  }
}

function setupNavigation() {
  document.querySelectorAll(".nav-item[data-jump]").forEach(btn => {
    btn.addEventListener("click", () => {
      showHome(false);
      document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      const id = btn.dataset.jump;
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior:"smooth", block:"start" });
      document.body.classList.remove("menu-open");
    });
  });

  $("#backButton").addEventListener("click", () => showHome());
  $("#mobileMenu").addEventListener("click", () => document.body.classList.toggle("menu-open"));

  window.addEventListener("popstate", () => {
    const m = location.hash.match(/^#item=(.+)$/);
    if (m) openDetail(decodeURIComponent(m[1]), false);
    else showHome(false);
  });
}

function setupSearch() {
  const dialog = $("#searchDialog");
  const input = $("#searchInput");

  function openSearch() {
    dialog.showModal();
    setTimeout(() => input.focus(), 30);
  }
  function closeSearch() {
    if (dialog.open) dialog.close();
  }

  $("#searchButton").addEventListener("click", openSearch);
  $("#searchButton").addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") openSearch();
  });
  $("#searchClose").addEventListener("click", closeSearch);

  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearch();
    } else if (e.key === "Escape") {
      closeSearch();
    }
  });

  input.addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    const results = !q ? [] : state.all.filter(x =>
      [x.title, x.summary, x.description].concat(x.tags || []).join(" ").toLowerCase().includes(q)
    ).slice(0,12);

    $("#searchResults").innerHTML = results.length
      ? results.map(x => '<div class="search-result" data-id="' + esc(x.id) + '"><b>' + esc(x.title) + '</b><span>' + esc(x.summary || '') + '</span></div>').join('')
      : (q ? '<div class="empty-state">검색 결과가 없습니다.</div>' : '');

    $("#searchResults").querySelectorAll(".search-result").forEach(row => {
      row.addEventListener("click", () => {
        closeSearch();
        openDetail(row.dataset.id);
      });
    });
  });
}

setupNavigation();
setupSearch();
loadData().catch(err => {
  console.error(err);
  document.querySelector("main").innerHTML = '<div class="empty-state">' + esc(err.message) + '</div>';
});
