const state = {
  data: null,
  all: [],
  lastRoute: "#/",
  categoryFilter: "all",
  categorySort: "deadline"
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const txt = (s, fallback = "확인 필요") => {
  const v = String(s == null ? "" : s).trim();
  return v || fallback;
};
const cut = (s, n) => {
  const v = txt(s, "");
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
function dangerClass(item) { return isToday(item) ? "danger" : ""; }

function itemKind(item) {
  if ((state.data.aiNews || []).some(x => x.id === item.id)) return "ai";
  if ((state.data.support || []).some(x => x.id === item.id)) return "support";
  return "contest";
}

function itemRoute(item) {
  const kind = itemKind(item);
  return "#/" + (kind === "ai" ? "ai" : kind) + "/" + encodeURIComponent(item.id);
}

async function loadData() {
  const date = requestedDate();
  const path = date ? "data/archive/" + date + ".json" : "data/latest.json";
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) throw new Error("브리핑 데이터를 불러오지 못했습니다.");

  state.data = await res.json();
  state.all = [].concat(state.data.contests || [], state.data.aiNews || [], state.data.support || []);
  renderShared();
  route();
}

function formatDate(s) {
  const d = new Date(s + "T00:00:00+09:00");
  const w = ["일","월","화","수","목","금","토"][d.getDay()];
  return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + w + "요일";
}

function renderShared() {
  const data = state.data;
  $("#topbarDate").textContent = formatDate(data.date);
  $("#year").textContent = new Date().getFullYear();
  $("#navContestCount").textContent = (data.contests || []).length;
  $("#navAiCount").textContent = (data.aiNews || []).length;
  $("#navSupportCount").textContent = (data.support || []).length;
  const hasSupport = (data.support || []).length > 0;
  $("#supportNav").hidden = !hasSupport;
  $("#mobileSupportNav").hidden = !hasSupport;
}

function hideAllViews() {
  ["#homeView","#categoryView","#archiveView","#detailView"].forEach(id => $(id).hidden = true);
}

function setActiveNav(routeName) {
  document.querySelectorAll(".nav-item, .mobile-tab").forEach(el => {
    el.classList.toggle("active", el.dataset.route === routeName);
  });
}

function route() {
  if (!state.data) return;

  const hash = location.hash || "#/";
  hideAllViews();
  document.body.classList.remove("menu-open");

  if (hash === "#/" || hash === "#") {
    setActiveNav("home");
    $("#homeView").hidden = false;
    renderHome();
    document.title = "오늘 | daily-brief";
    return;
  }

  if (hash === "#/contests") {
    setActiveNav("contests");
    $("#categoryView").hidden = false;
    renderCategory("contests");
    document.title = "공모전 · 해커톤 | daily-brief";
    state.lastRoute = hash;
    return;
  }

  if (hash === "#/ai-news") {
    setActiveNav("ai-news");
    $("#categoryView").hidden = false;
    renderCategory("ai-news");
    document.title = "AI 뉴스 | daily-brief";
    state.lastRoute = hash;
    return;
  }

  if (hash === "#/support") {
    setActiveNav("support");
    $("#categoryView").hidden = false;
    renderCategory("support");
    document.title = "지원사업 | daily-brief";
    state.lastRoute = hash;
    return;
  }

  if (hash === "#/archive") {
    setActiveNav("archive");
    $("#archiveView").hidden = false;
    renderArchivePage();
    document.title = "아카이브 | daily-brief";
    state.lastRoute = hash;
    return;
  }

  const m = hash.match(/^#\/(contest|ai|support)\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[2]);
    const item = state.all.find(x => x.id === id);
    if (item) {
      setActiveNav(m[1] === "ai" ? "ai-news" : m[1] === "support" ? "support" : "contests");
      $("#detailView").hidden = false;
      renderDetail(item);
      document.title = item.title + " | daily-brief";
      return;
    }
  }

  location.hash = "#/";
}

function renderHome() {
  const contests = state.data.contests || [];
  const news = state.data.aiNews || [];
  const support = state.data.support || [];

  $("#todayDeadlineCount").textContent = contests.filter(isToday).length + support.filter(isToday).length;
  $("#weekDeadlineCount").textContent = contests.filter(withinWeek).length + support.filter(withinWeek).length;
  $("#contestCount").textContent = contests.length;
  $("#aiCount").textContent = news.length;

  renderFeatured(contests, support);
  renderCompact("#homeContestList", contests.slice(0, 3), "contest");
  renderCompact("#homeAiList", news.slice(0, 4), "ai");
  renderCompact("#homeSupportList", support.slice(0, 3), "support");
  renderArchiveStrip("#homeArchiveDays", state.data.archive || []);

  $("#homeSupportPanel").hidden = support.length === 0;
  $("#supportNav").hidden = support.length === 0;
  $("#mobileSupportNav").hidden = support.length === 0;
}

function renderFeatured(contests, support) {
  const pool = [].concat(contests, support);
  const el = $("#featuredOpportunity");

  if (!pool.length) {
    el.innerHTML = '<div class="featured-inner"><div><h3 class="featured-title">지금 바로 확인할 공고가 없습니다.</h3><p class="featured-summary">조건에 맞는 새 공고가 확인되면 여기에 가장 먼저 표시됩니다.</p></div></div>';
    return;
  }

  const item = pool.slice().sort((a,b) => {
    const da = ddayNumber(a), db = ddayNumber(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  })[0];

  const kind = itemKind(item);
  const category = kind === "support" ? "지원사업" : "공모전 · 해커톤";

  el.innerHTML =
    '<div class="featured-flow">' +
      '<div class="featured-kicker">' +
        (item.dDay ? '<span class="featured-badge ' + dangerClass(item) + '">' + esc(item.dDay) + '</span>' : '') +
        '<span class="featured-meta">' + category + '</span>' +
      '</div>' +
      '<h3 class="featured-title">' + esc(item.title) + '</h3>' +
      '<p class="featured-summary">' + esc(item.summary || "") + '</p>' +
      '<div class="featured-facts">' +
        '<div class="flow-fact"><span>마감</span><strong>' + esc(txt(item.deadlineText || item.dDay)) + '</strong></div>' +
        '<div class="flow-fact"><span>' + (kind === "support" ? "지원 / 혜택" : "상금 / 보상") + '</span><strong>' + esc(cut(item.reward || item.aiSupport, 90)) + '</strong></div>' +
        '<div class="flow-fact"><span>' + (kind === "support" ? "지원 대상" : "참가") + '</span><strong>' + esc(cut(item.participation, 90)) + '</strong></div>' +
      '</div>' +
      '<span class="featured-cta">상세 보기 →</span>' +
    '</div>';

  el.onclick = () => location.hash = itemRoute(item);
}

function renderCompact(sel, items, kind) {
  const el = $(sel);
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">현재 표시할 정보가 없습니다.</div>';
    return;
  }

  el.innerHTML = items.map(item => {
    const status = kind === "ai" ? (item.updatedAgo || "오늘") : (item.dDay || "진행중");
    const category = kind === "ai" ? "AI NEWS" : kind === "support" ? "지원사업" : "공모전 · 해커톤";
    const foot = kind === "ai"
      ? ((item.tags || []).slice(0,2).join(" · ") || "AI")
      : "마감 " + txt(item.deadlineText || item.dDay);

    return '<article class="compact-item compact-flow" data-id="' + esc(item.id) + '">' +
      '<div class="compact-meta"><span class="compact-status ' + (kind !== "ai" ? dangerClass(item) : "") + '">' + esc(status) + '</span><span class="compact-category">' + category + '</span></div>' +
      '<h3>' + esc(item.title) + '</h3>' +
      '<p>' + esc(item.summary || "") + '</p>' +
      '<div class="compact-foot">' + esc(foot) + ' <span>→</span></div>' +
    '</article>';
  }).join("");

  el.querySelectorAll(".compact-item").forEach(row => {
    row.addEventListener("click", () => {
      const item = state.all.find(x => x.id === row.dataset.id);
      location.hash = itemRoute(item);
    });
  });
}

function renderArchiveStrip(sel, days) {
  const el = $(sel);
  const current = state.data.date;
  el.innerHTML = days.slice(0, 10).map(d => {
    const dt = new Date(d + "T00:00:00+09:00");
    const w = ["일","월","화","수","목","금","토"][dt.getDay()];
    return '<button class="archive-day ' + (d === current ? "active" : "") + '" data-date="' + d + '"><small>' + (dt.getMonth()+1) + '월</small><strong>' + dt.getDate() + '</strong><small>' + w + '</small></button>';
  }).join("");

  el.querySelectorAll(".archive-day").forEach(btn => {
    btn.addEventListener("click", () => openArchiveDate(btn.dataset.date));
  });
}

function renderCategory(type) {
  state.categoryFilter = "all";
  state.categorySort = type === "ai-news" ? "default" : "deadline";

  const configs = {
    contests: {
      eyebrow:"OPPORTUNITIES",
      title:"공모전 · 해커톤",
      description:"홈보다 더 자세하게 비교하고, 조건에 맞는 공고만 골라볼 수 있습니다."
    },
    "ai-news": {
      eyebrow:"AI SIGNALS",
      title:"AI 뉴스",
      description:"새 모델·에이전트·코딩AI·멀티모달·보안 흐름을 주제별로 탐색합니다."
    },
    support: {
      eyebrow:"SUPPORT",
      title:"지원사업",
      description:"현재 조건에서 실제 신청 가능한 지원사업만 모아봅니다."
    }
  };

  const cfg = configs[type];
  $("#categoryEyebrow").textContent = cfg.eyebrow;
  $("#categoryTitle").textContent = cfg.title;
  $("#categoryDescription").textContent = cfg.description;

  const sort = $("#categorySort");
  if (type === "ai-news") {
    sort.innerHTML = '<option value="default">최신 브리핑순</option>';
  } else {
    sort.innerHTML = '<option value="deadline">마감 임박순</option><option value="default">기본순</option>';
  }
  sort.value = state.categorySort;

  renderFilterChips(type);
  renderCategoryList(type);
}

function filterDefs(type) {
  if (type === "contests") return [
    ["all","전체"],
    ["urgent","7일 이내"],
    ["individual","개인·1인 가능"],
    ["prestart","예비창업자"],
    ["ai","AI"]
  ];
  if (type === "ai-news") return [
    ["all","전체"],
    ["agent","에이전트"],
    ["coding","코딩 AI"],
    ["multimodal","멀티모달"],
    ["security","보안"],
    ["open","오픈소스"]
  ];
  return [
    ["all","전체"],
    ["urgent","7일 이내"],
    ["prestart","예비창업"],
    ["credit","크레딧·클라우드"],
    ["cash","지원금"]
  ];
}

function renderFilterChips(type) {
  const el = $("#categoryFilters");
  el.innerHTML = filterDefs(type).map(([key,label]) =>
    '<button class="filter-chip ' + (key === state.categoryFilter ? "active" : "") + '" data-filter="' + key + '">' + label + '</button>'
  ).join("");

  el.querySelectorAll(".filter-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      state.categoryFilter = btn.dataset.filter;
      renderFilterChips(type);
      renderCategoryList(type);
    });
  });
}

function sourceFor(type) {
  if (type === "contests") return state.data.contests || [];
  if (type === "ai-news") return state.data.aiNews || [];
  return state.data.support || [];
}

function matchesFilter(item, type, filter) {
  if (filter === "all") return true;

  const hay = [item.title,item.summary,item.description,item.participation,item.preStartup,item.aiSupport]
    .concat(item.tags || []).join(" ").toLowerCase();

  if (filter === "urgent") return withinWeek(item);
  if (filter === "individual") return /개인|1인/.test(hay);
  if (filter === "prestart") return /예비창업/.test(hay) && !/대상 아님/.test(hay);
  if (filter === "ai") return /\bai\b|생성형|llm|rag|gpt|인공지능/i.test(hay);
  if (filter === "agent") return /agent|에이전트/i.test(hay);
  if (filter === "coding") return /coding|코딩|개발자/i.test(hay);
  if (filter === "multimodal") return /multimodal|멀티모달|vision|voice|음성|이미지/i.test(hay);
  if (filter === "security") return /security|보안|threat|위협|anomaly/i.test(hay);
  if (filter === "open") return /open.?source|오픈소스|github|hugging face/i.test(hay);
  if (filter === "credit") return /크레딧|cloud|클라우드|gpu|api/i.test(hay);
  if (filter === "cash") return /만원|억원|지원금|바우처/i.test(hay);
  return true;
}

function renderCategoryList(type) {
  let items = sourceFor(type).filter(item => matchesFilter(item, type, state.categoryFilter));

  if (state.categorySort === "deadline") {
    items = items.slice().sort((a,b) => {
      const da = ddayNumber(a), db = ddayNumber(b);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }

  $("#categoryCount").textContent = items.length + "건";
  const el = $("#categoryList");

  if (!items.length) {
    el.innerHTML = '<div class="empty-state">이 조건에 해당하는 정보가 없습니다.</div>';
    return;
  }

  if (type === "ai-news") {
    el.innerHTML = items.map(item =>
      '<article class="category-card ai-category-card" data-id="' + esc(item.id) + '">' +
        '<div class="category-item-meta"><span class="meta-label">AI NEWS</span><span class="meta-label">' + esc(item.updatedAgo || "오늘") + '</span></div>' +
        '<h3 class="category-item-title">' + esc(item.title) + '</h3>' +
        '<p class="category-item-summary">' + esc(item.summary || "") + '</p>' +
        tagsHtml(item.tags) +
        '<div class="category-explainer"><span>왜 볼까?</span><p>' + esc(txt(item.why || item.description || item.summary, "")) + '</p></div>' +
        '<div class="category-action">자세히 보기 <span>→</span></div>' +
      '</article>'
    ).join("");
  } else {
    const kind = type === "support" ? "support" : "contest";
    el.innerHTML = items.map(item =>
      '<article class="category-card" data-id="' + esc(item.id) + '">' +
        '<div class="category-item-meta">' +
          (item.dDay ? '<span class="meta-status ' + dangerClass(item) + '">' + esc(item.dDay) + '</span>' : '') +
          '<span class="meta-label">' + (kind === "support" ? "지원사업" : "공모전 · 해커톤") + '</span>' +
        '</div>' +
        '<h3 class="category-item-title">' + esc(item.title) + '</h3>' +
        '<p class="category-item-summary">' + esc(item.summary || "") + '</p>' +
        tagsHtml(item.tags) +
        '<div class="category-facts-flow">' +
          '<div class="flow-fact"><span>마감</span><strong>' + esc(txt(item.deadlineText || item.dDay)) + '</strong></div>' +
          '<div class="flow-fact"><span>' + (kind === "support" ? "지원 / 혜택" : "상금 / 보상") + '</span><strong>' + esc(txt(item.reward || item.aiSupport)) + '</strong></div>' +
          '<div class="flow-fact"><span>' + (kind === "support" ? "지원 대상" : "참가") + '</span><strong>' + esc(txt(item.participation)) + '</strong></div>' +
        '</div>' +
        '<div class="category-action">상세 보기 <span>→</span></div>' +
      '</article>'
    ).join("");
  }

  el.querySelectorAll(".category-card").forEach(row => {
    row.addEventListener("click", () => {
      state.lastRoute = location.hash;
      const item = state.all.find(x => x.id === row.dataset.id);
      location.hash = itemRoute(item);
    });
  });
}

function tagsHtml(tags) {
  return '<div class="category-tags">' + (tags || []).slice(0,4).map(t => '<span class="category-tag">' + esc(t) + '</span>').join("") + '</div>';
}

function renderArchivePage() {
  const days = state.data.archive || [];
  const el = $("#archivePageGrid");
  if (!days.length) {
    el.innerHTML = '<div class="empty-state">아직 저장된 브리핑이 없습니다.</div>';
    return;
  }

  el.innerHTML = days.map(d => {
    const dt = new Date(d + "T00:00:00+09:00");
    const w = ["일","월","화","수","목","금","토"][dt.getDay()];
    return '<article class="archive-card" data-date="' + d + '"><small>' + dt.getFullYear() + '년 ' + (dt.getMonth()+1) + '월</small><strong>' + dt.getDate() + '일 ' + w + '요일</strong><span>이날의 브리핑 보기 →</span></article>';
  }).join("");

  el.querySelectorAll(".archive-card").forEach(card => {
    card.addEventListener("click", () => openArchiveDate(card.dataset.date));
  });
}

function openArchiveDate(date) {
  const u = new URL(location.href);
  u.searchParams.set("date", date);
  u.hash = "#/";
  location.href = u.toString();
}

function renderDetail(item) {
  const kind = itemKind(item);
  if (kind === "ai") renderNewsDetail(item);
  else renderOpportunityDetail(item, kind);
  window.scrollTo({top:0,behavior:"instant"});
}

function renderOpportunityDetail(item, kind) {
  const category = kind === "support" ? "지원사업" : "공모전 · 해커톤";
  const links = item.links || [];
  const ideas = item.ideas || [];

  $("#detailHeader").innerHTML =
    '<div class="detail-kicker">' +
      (item.dDay ? '<span class="detail-pill ' + dangerClass(item) + '">' + esc(item.dDay) + '</span>' : '') +
      '<span class="detail-pill">' + category + '</span>' +
    '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.description || item.summary || "") + '</p>';

  $("#detailTopActions").innerHTML = links.slice(0,2).map((l,i) =>
    '<a class="' + (i === 0 ? "primary-link" : "secondary-link") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' ↗</a>'
  ).join("");

  const core = [
    ["마감", item.deadlineText || item.dDay],
    ["접수 / 일정", item.period],
    ["참가 / 대상", item.participation],
    ["상금 / 지원", item.reward]
  ].filter(x => x[1]);

  const eligible = [
    ["예비창업자", item.preStartup],
    ["재직자 · 겸업", item.employment],
    ["사업자등록", item.businessRegistration]
  ].filter(x => x[1]);

  const process = [
    ["평가방식", item.evaluation],
    ["AI / 클라우드 지원", item.aiSupport]
  ].filter(x => x[1]);

  $("#detailContent").innerHTML =
    infoBlock("핵심 정보","신청 전에 가장 먼저 확인할 내용입니다.",core) +
    infoBlock("지원 자격","내가 실제로 신청 가능한지 확인합니다.",eligible) +
    infoBlock("진행 방식","",process) +
    (ideas.length ? ideaBlock(kind === "support" ? "어떻게 활용할까?" : "뭘 만들어볼까?", ideas) : "") +
    (links.length ? '<section class="detail-block"><h2>공식 링크</h2><div class="official-link-list">' + links.map(l => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><span>' + esc(l.label) + '</span><span>↗</span></a>').join("") + '</div></section>' : '');

  $("#detailAside").innerHTML = "";
}

function renderNewsDetail(item) {
  const links = item.links || [];
  const ideas = item.ideas || [];

  $("#detailHeader").innerHTML =
    '<div class="detail-kicker"><span class="detail-pill">AI NEWS</span>' +
    (item.updatedAgo ? '<span class="detail-pill">' + esc(item.updatedAgo) + '</span>' : '') +
    '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.summary || "") + '</p>';

  $("#detailTopActions").innerHTML = links.slice(0,2).map((l,i) =>
    '<a class="' + (i === 0 ? "primary-link" : "secondary-link") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' ↗</a>'
  ).join("");

  $("#detailContent").innerHTML =
    infoBlock("무슨 일이야?","",[["핵심",item.description || item.summary]]) +
    infoBlock("왜 봐야 해?","",[["의미",item.why || item.description || item.summary]]) +
    (ideas.length ? ideaBlock("어떻게 써볼까?",ideas) : "") +
    (links.length ? '<section class="detail-block"><h2>공식 링크</h2><div class="official-link-list">' + links.map(l => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><span>' + esc(l.label) + '</span><span>↗</span></a>').join("") + '</div></section>' : '');

  $("#detailAside").innerHTML = "";
}

function infoBlock(title,desc,rows) {
  if (!rows.length) return "";
  return '<section class="detail-block"><h2>' + esc(title) + '</h2>' +
    (desc ? '<p class="block-desc">' + esc(desc) + '</p>' : '') +
    '<div class="info-table">' + rows.map(r => '<dl class="info-row"><dt>' + esc(r[0]) + '</dt><dd>' + esc(txt(r[1])) + '</dd></dl>').join("") + '</div></section>';
}

function ideaBlock(title,ideas) {
  return '<section class="detail-block"><h2>' + esc(title) + '</h2><div class="idea-list">' +
    ideas.map((v,i) => '<div class="idea-item"><span class="idea-index">' + (i+1) + '</span><p>' + esc(v) + '</p></div>').join("") +
    '</div></section>';
}

function asideFact(label,value) {
  return '<div class="aside-fact"><span>' + esc(label) + '</span><strong>' + esc(txt(value)) + '</strong></div>';
}

function goBack() {
  const fallback = itemKind(state.all.find(x => location.hash.endsWith(encodeURIComponent(x.id)))) === "ai" ? "#/ai-news" : state.lastRoute || "#/";
  location.hash = fallback;
}

function setupInteractions() {
  window.addEventListener("hashchange", route);

  $("#mobileMenu").addEventListener("click", () => document.body.classList.toggle("menu-open"));
  document.querySelectorAll(".nav-item").forEach(a => a.addEventListener("click", () => document.body.classList.remove("menu-open")));

  $("#backButton").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.hash = state.lastRoute || "#/";
  });

  $("#categorySort").addEventListener("change", e => {
    state.categorySort = e.target.value;
    const routeName = location.hash.replace("#/","");
    renderCategoryList(routeName);
  });

  const dialog = $("#searchDialog");
  const input = $("#searchInput");

  const openSearch = () => {
    dialog.showModal();
    setTimeout(() => input.focus(),30);
  };
  const closeSearch = () => { if (dialog.open) dialog.close(); };

  $("#searchButton").addEventListener("click", openSearch);
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
      [x.title,x.summary,x.description].concat(x.tags || []).join(" ").toLowerCase().includes(q)
    ).slice(0,12);

    $("#searchResults").innerHTML = results.length
      ? results.map(x => '<div class="search-result" data-id="' + esc(x.id) + '"><b>' + esc(x.title) + '</b><span>' + esc(x.summary || "") + '</span></div>').join("")
      : (q ? '<div class="empty-state">검색 결과가 없습니다.</div>' : '');

    $("#searchResults").querySelectorAll(".search-result").forEach(row => {
      row.addEventListener("click", () => {
        const item = state.all.find(x => x.id === row.dataset.id);
        closeSearch();
        state.lastRoute = location.hash || "#/";
        location.hash = itemRoute(item);
      });
    });
  });
}

setupInteractions();
loadData().catch(err => {
  console.error(err);
  document.querySelector("main").innerHTML = '<div class="empty-state">' + esc(err.message) + '</div>';
});