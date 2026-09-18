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

function upcomingWeek(item) {
  const n = ddayNumber(item);
  return n !== null && n >= 1 && n <= 7;
}

function briefNames(items, emptyText, max = 2) {
  if (!items.length) return emptyText;
  const labels = items.slice(0, max).map(item => {
    const suffix = item.deadlineText ? " · " + item.deadlineText : item.dDay ? " · " + item.dDay : "";
    return item.title + suffix;
  });
  const rest = items.length - labels.length;
  return labels.join(" / ") + (rest > 0 ? " 외 " + rest + "건" : "");
}

function shortDate(s) {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[2] + "." + m[3] : String(s);
}

function isOpenItem(item) {
  return String(item.status || "OPEN").toUpperCase() !== "CLOSED";
}

function isNewToday(item) {
  return item && item.firstSeenDate === state.data.date;
}

function isUpdatedToday(item) {
  return item && item.lastUpdatedDate === state.data.date && item.firstSeenDate !== state.data.date;
}

function latestDateValue(item) {
  return item.lastUpdatedDate || item.firstSeenDate || "";
}

function opportunityPriority(items) {
  return items.slice().sort((a,b) => {
    const na = isNewToday(a) ? 0 : 1;
    const nb = isNewToday(b) ? 0 : 1;
    if (na !== nb) return na - nb;
    const da = ddayNumber(a), db = ddayNumber(b);
    if (da !== null || db !== null) {
      if (da === null) return 1;
      if (db === null) return -1;
      if (da !== db) return da - db;
    }
    return String(b.firstSeenDate || "").localeCompare(String(a.firstSeenDate || ""));
  });
}

function newsPriority(items) {
  return items.slice().sort((a,b) => {
    const pa = isNewToday(a) ? 0 : isUpdatedToday(a) ? 1 : 2;
    const pb = isNewToday(b) ? 0 : isUpdatedToday(b) ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return latestDateValue(b).localeCompare(latestDateValue(a));
  });
}

function changeBadge(item, kind) {
  if (isNewToday(item)) return '<span class="change-badge new">오늘 신규</span>';
  if (kind === "ai" && isUpdatedToday(item)) return '<span class="change-badge updated">오늘 업데이트</span>';
  return "";
}

function dateMetaHtml(item, kind) {
  const first = shortDate(item.firstSeenDate);
  const second = kind === "ai"
    ? shortDate(item.lastUpdatedDate || item.firstSeenDate)
    : shortDate(item.lastVerifiedDate || item.firstSeenDate);
  const secondLabel = kind === "ai" ? "최종 업데이트" : "최종 확인";

  return '<div class="card-date-meta">' +
    (first ? '<span><b>발견일</b> ' + esc(first) + '</span>' : '') +
    (second ? '<span><b>' + secondLabel + '</b> ' + esc(second) + '</span>' : '') +
  '</div>';
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
  $("#navContestCount").textContent = (data.contests || []).filter(isOpenItem).length;
  $("#navAiCount").textContent = (data.aiNews || []).length;
  $("#navSupportCount").textContent = (data.support || []).filter(isOpenItem).length;
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

  const openContests = contests.filter(isOpenItem);
  const openSupport = support.filter(isOpenItem);
  const newToday = items => items.filter(isNewToday).length;
  const updatedToday = items => items.filter(isUpdatedToday).length;

  $("#homeContestCount").textContent = "신규 " + newToday(contests) + " · 진행중 " + openContests.length;
  $("#homeAiCount").textContent = "신규 " + newToday(news) + " · 업데이트 " + updatedToday(news);
  $("#homeSupportCount").textContent = "신규 " + newToday(support) + " · 진행중 " + openSupport.length;

  renderFeatured(openContests, openSupport);
  renderCompact("#homeContestList", opportunityPriority(openContests).slice(0, 4), "contest");
  renderCompact("#homeAiList", newsPriority(news).slice(0, 5), "ai");
  renderCompact("#homeSupportList", opportunityPriority(openSupport).slice(0, 4), "support");
  renderArchiveStrip("#homeArchiveDays", state.data.archive || []);

  $("#homeSupportPanel").hidden = openSupport.length === 0;
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
    const isAi = kind === "ai";
    const category = isAi ? "AI 뉴스" : kind === "support" ? "지원사업" : "공모전 · 해커톤";
    const primaryStatus = isAi
      ? ""
      : '<span class="compact-status ' + dangerClass(item) + '">' + esc(!isOpenItem(item) ? "종료" : (item.dDay || "접수중")) + '</span>';

    const foot = isAi
      ? ((item.tags || []).slice(0,3).join(" · ") || "AI")
      : "마감 " + txt(item.deadlineText || item.dDay);

    return '<article class="compact-item compact-flow" data-id="' + esc(item.id) + '">' +
      '<div class="card-meta-row">' +
        '<div class="card-status-group">' +
          changeBadge(item, kind) +
          primaryStatus +
          '<span class="compact-category">' + category + '</span>' +
        '</div>' +
        dateMetaHtml(item, kind) +
      '</div>' +
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
  state.categoryFilter = type === "ai-news" ? "all" : "open";
  state.categorySort = type === "ai-news" ? "updated" : "deadline";

  const configs = {
    contests: {
      eyebrow:"현재 신청 가능",
      title:"공모전 · 해커톤",
      description:"진행 중인 공고를 기본으로 보여드립니다. 새로 발견한 공고와 마감이 가까운 공고를 먼저 확인하세요."
    },
    "ai-news": {
      eyebrow:"새 이슈 · 후속 업데이트",
      title:"AI 뉴스",
      description:"완전히 새로운 이슈는 추가하고, 같은 이슈의 후속 소식은 기존 항목에 업데이트로 이어서 기록합니다."
    },
    support: {
      eyebrow:"현재 신청 가능",
      title:"지원사업",
      description:"실제로 신청 가능한 지원사업을 기본으로 보여드리고, 종료된 공고도 이력으로 보관합니다."
    }
  };

  const cfg = configs[type];
  $("#categoryEyebrow").textContent = cfg.eyebrow;
  $("#categoryTitle").textContent = cfg.title;
  $("#categoryDescription").textContent = cfg.description;

  const sort = $("#categorySort");
  if (type === "ai-news") {
    sort.innerHTML = '<option value="updated">최근 업데이트순</option><option value="discovered">최근 발견순</option>';
  } else {
    sort.innerHTML = '<option value="deadline">마감 임박순</option><option value="discovered">최근 발견순</option><option value="updated">최근 변경순</option>';
  }
  sort.value = state.categorySort;

  renderFilterChips(type);
  renderCategoryList(type);
}

function filterDefs(type) {
  if (type === "contests") return [
    ["open","진행중"],
    ["new","오늘 신규"],
    ["urgent","7일 이내"],
    ["individual","개인·1인"],
    ["closed","종료"],
    ["all","전체 누적"]
  ];
  if (type === "ai-news") return [
    ["all","전체 이슈"],
    ["new","오늘 신규"],
    ["updated","오늘 업데이트"],
    ["agent","에이전트"],
    ["coding","코딩 AI"],
    ["opensource","MCP·오픈소스"],
    ["security","보안"]
  ];
  return [
    ["open","진행중"],
    ["new","오늘 신규"],
    ["urgent","7일 이내"],
    ["prestart","예비창업"],
    ["closed","종료"],
    ["all","전체 누적"]
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

  const hay = [item.title,item.summary,item.description,item.participation,item.preStartup,item.aiSupport,item.why]
    .concat(item.tags || [])
    .concat((item.updates || []).map(u => [u.label,u.text].join(" ")))
    .join(" ").toLowerCase();

  if (filter === "open") return type === "ai-news" ? true : isOpenItem(item);
  if (filter === "closed") return type !== "ai-news" && !isOpenItem(item);
  if (filter === "new") return isNewToday(item);
  if (filter === "updated") return type === "ai-news" && isUpdatedToday(item);
  if (filter === "urgent") return isOpenItem(item) && withinWeek(item);
  if (filter === "individual") return /개인|1인|혼자/.test(hay);
  if (filter === "prestart") return /예비창업/.test(hay) && !/대상 아님/.test(hay);
  if (filter === "agent") return /agent|에이전트/i.test(hay);
  if (filter === "coding") return /coding|코딩|개발자|engineering/i.test(hay);
  if (filter === "security") return /security|보안|threat|위협|anomaly|관측/i.test(hay);
  if (filter === "opensource") return /open.?source|오픈소스|github|hugging face|mcp/i.test(hay);
  return true;
}

function renderCategoryList(type) {
  const source = sourceFor(type);
  let items = source.filter(item => matchesFilter(item, type, state.categoryFilter));

  if (state.categorySort === "deadline") {
    items = items.slice().sort((a,b) => {
      if (isOpenItem(a) !== isOpenItem(b)) return isOpenItem(a) ? -1 : 1;
      const da = ddayNumber(a), db = ddayNumber(b);
      if (da === null && db === null) return String(b.firstSeenDate || "").localeCompare(String(a.firstSeenDate || ""));
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  } else if (state.categorySort === "updated") {
    items = newsPriority(items);
  } else if (state.categorySort === "discovered") {
    items = items.slice().sort((a,b) => String(b.firstSeenDate || "").localeCompare(String(a.firstSeenDate || "")));
  }

  const newCount = source.filter(isNewToday).length;
  const updatedCount = source.filter(isUpdatedToday).length;
  if (type === "ai-news") {
    $("#categoryCount").textContent = "전체 " + source.length + " · 오늘 신규 " + newCount + " · 업데이트 " + updatedCount;
  } else {
    const openCount = source.filter(isOpenItem).length;
    $("#categoryCount").textContent = "진행중 " + openCount + " · 오늘 신규 " + newCount + " · 전체 " + source.length;
  }

  const el = $("#categoryList");
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">이 조건에 해당하는 정보가 없습니다.</div>';
    return;
  }

  if (type === "ai-news") {
    el.innerHTML = items.map(item =>
      '<article class="category-card ai-category-card" data-id="' + esc(item.id) + '">' +
        '<div class="card-meta-row">' +
          '<div class="card-status-group">' +
            changeBadge(item, "ai") +
            '<span class="meta-label">AI 뉴스</span>' +
          '</div>' +
          dateMetaHtml(item, "ai") +
        '</div>' +
        '<h3 class="category-item-title">' + esc(item.title) + '</h3>' +
        '<p class="category-item-summary">' + esc(item.summary || "") + '</p>' +
        tagsHtml(item.tags) +
        '<div class="category-explainer"><span>왜 중요한가</span><p>' + esc(txt(item.why || item.description || item.summary, "")) + '</p></div>' +
        '<div class="category-action">업데이트 기록과 상세 내용 보기 <span>→</span></div>' +
      '</article>'
    ).join("");
  } else {
    const kind = type === "support" ? "support" : "contest";
    el.innerHTML = items.map(item =>
      '<article class="category-card ' + (!isOpenItem(item) ? "is-closed" : "") + '" data-id="' + esc(item.id) + '">' +
        '<div class="card-meta-row">' +
          '<div class="card-status-group">' +
            changeBadge(item, kind) +
            '<span class="meta-status ' + (isOpenItem(item) ? dangerClass(item) : "") + '">' + esc(!isOpenItem(item) ? "종료" : (item.dDay || "접수중")) + '</span>' +
            '<span class="meta-label">' + (kind === "support" ? "지원사업" : "공모전 · 해커톤") + '</span>' +
          '</div>' +
          dateMetaHtml(item, kind) +
        '</div>' +
        '<h3 class="category-item-title">' + esc(item.title) + '</h3>' +
        '<p class="category-item-summary">' + esc(item.summary || "") + '</p>' +
        tagsHtml(item.tags) +
        '<div class="category-facts-flow">' +
          '<div class="flow-fact"><span>마감</span><strong>' + esc(txt(item.deadlineText || item.dDay)) + '</strong></div>' +
          '<div class="flow-fact"><span>' + (kind === "support" ? "지원 / 혜택" : "상금 / 보상") + '</span><strong>' + esc(txt(item.reward || item.aiSupport)) + '</strong></div>' +
          '<div class="flow-fact"><span>' + (kind === "support" ? "지원 대상" : "참가 조건") + '</span><strong>' + esc(txt(item.participation)) + '</strong></div>' +
        '</div>' +
        '<div class="category-action">상세 내용 보기 <span>→</span></div>' +
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
      changeBadge(item, kind) +
      '<span class="detail-pill">' + esc(isOpenItem(item) ? (item.dDay || "진행중") : "종료") + '</span>' +
      '<span class="detail-pill">' + category + '</span>' +
    '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.description || item.summary || "") + '</p>' +
    '<div class="detail-date-line"><span><b>발견일</b> ' + esc(shortDate(item.firstSeenDate)) + '</span><span><b>최종 확인</b> ' + esc(shortDate(item.lastVerifiedDate || item.firstSeenDate)) + '</span>' +
    (item.lastUpdatedDate ? '<span><b>정보 수정</b> ' + esc(shortDate(item.lastUpdatedDate)) + '</span>' : '') + '</div>';

  $("#detailTopActions").innerHTML = links.slice(0,2).map((l,i) =>
    '<a class="' + (i === 0 ? "primary-link" : "secondary-link") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' ↗</a>'
  ).join("");

  const core = [
    ["마감", item.deadlineText || item.dDay],
    ["접수 / 일정", item.period],
    ["참가 조건", item.participation],
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
    infoBlock("핵심 정보","신청 여부를 판단할 때 먼저 볼 내용입니다.",core) +
    infoBlock("신청 자격","실제로 참여 가능한지 확인합니다.",eligible) +
    infoBlock("진행 방식","",process) +
    (ideas.length ? ideaBlock(kind === "support" ? "활용 아이디어" : "만들어볼 아이디어", ideas) : "") +
    (links.length ? '<section class="detail-block"><h2>공식 링크</h2><div class="official-link-list">' + links.map(l => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><span>' + esc(l.label) + '</span><span>↗</span></a>').join("") + '</div></section>' : '');

  $("#detailAside").innerHTML = "";
}

function renderNewsDetail(item) {
  const links = item.links || [];
  const ideas = item.ideas || [];

  $("#detailHeader").innerHTML =
    '<div class="detail-kicker">' +
      changeBadge(item, "ai") +
      '<span class="detail-pill">AI 뉴스</span>' +
    '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.summary || "") + '</p>' +
    '<div class="detail-date-line"><span><b>발견일</b> ' + esc(shortDate(item.firstSeenDate)) + '</span><span><b>최종 업데이트</b> ' + esc(shortDate(item.lastUpdatedDate || item.firstSeenDate)) + '</span></div>';

  $("#detailTopActions").innerHTML = links.slice(0,2).map((l,i) =>
    '<a class="' + (i === 0 ? "primary-link" : "secondary-link") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' ↗</a>'
  ).join("");

  $("#detailContent").innerHTML =
    updateTimeline(item.updates || []) +
    infoBlock("현재 핵심","",[["내용",item.description || item.summary]]) +
    infoBlock("왜 중요한가","",[["의미",item.why || item.description || item.summary]]) +
    (ideas.length ? ideaBlock("직접 써볼 방법",ideas) : "") +
    (links.length ? '<section class="detail-block"><h2>공식 링크</h2><div class="official-link-list">' + links.map(l => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><span>' + esc(l.label) + '</span><span>↗</span></a>').join("") + '</div></section>' : '');

  $("#detailAside").innerHTML = "";
}

function infoBlock(title,desc,rows) {
  if (!rows.length) return "";
  return '<section class="detail-block"><h2>' + esc(title) + '</h2>' +
    (desc ? '<p class="block-desc">' + esc(desc) + '</p>' : '') +
    '<div class="info-table">' + rows.map(r => '<dl class="info-row"><dt>' + esc(r[0]) + '</dt><dd>' + esc(txt(r[1])) + '</dd></dl>').join("") + '</div></section>';
}

function updateTimeline(updates) {
  if (!updates.length) return "";
  const sorted = updates.slice().sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")));
  return '<section class="detail-block update-history"><div class="update-history-head"><h2>업데이트 기록</h2><span>' + sorted.length + '회</span></div><div class="timeline-list">' +
    sorted.map(u => '<div class="timeline-item"><div class="timeline-date">' + esc(shortDate(u.date)) + '</div><div class="timeline-body"><strong>' + esc(u.label || "업데이트") + '</strong><p>' + esc(u.text || "") + '</p></div></div>').join("") +
    '</div></section>';
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
      [x.title,x.summary,x.description,x.why]
        .concat(x.tags || [])
        .concat((x.updates || []).map(u => [u.label,u.text].join(" ")))
        .join(" ").toLowerCase().includes(q)
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