const state = {
  data: null,
  all: [],
  lastRoute: "#/",
  categoryFilter: "all",
  categoryTopicFilter: "all",
  categorySort: "deadline",
  activeRoute: null,
  viewStates: {},
  discoveryFilter: "all"
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

const VIEW_STATE_KEY = "daily-brief:view-state:" + location.pathname + location.search;

function hydrateViewStates() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEW_STATE_KEY) || "{}");
    if (saved && typeof saved === "object") state.viewStates = saved;
  } catch (_) {
    state.viewStates = {};
  }
}

function persistViewStates() {
  try {
    sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify(state.viewStates));
  } catch (_) {}
}

function saveViewState(route = state.activeRoute) {
  if (!route) return;

  const snapshot = {
    ...(state.viewStates[route] || {}),
    scrollY: Math.max(0, Math.round(window.scrollY || 0))
  };

  if (route === "#/contests" || route === "#/ai-news" || route === "#/ai-discovery" || route === "#/support") {
    snapshot.categoryFilter = state.categoryFilter;
    snapshot.categoryTopicFilter = state.categoryTopicFilter;
    snapshot.categorySort = state.categorySort;
  }

  state.viewStates[route] = snapshot;
  persistViewStates();
}

function restoreViewState(route) {
  const snapshot = state.viewStates[route];
  const targetY = snapshot && Number.isFinite(Number(snapshot.scrollY))
    ? Math.max(0, Number(snapshot.scrollY))
    : 0;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({top: targetY, left: 0, behavior: "instant"});
    });
  });
}

function completeRoute(route) {
  state.activeRoute = route;
  restoreViewState(route);
}

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
  if ((state.data.aiDiscovery || []).some(x => x.id === item.id)) return "discovery";
  if ((state.data.support || []).some(x => x.id === item.id)) return "support";
  return "contest";
}

function itemRoute(item) {
  const kind = itemKind(item);
  return "#/" + (kind === "ai" ? "ai" : kind === "discovery" ? "discovery" : kind) + "/" + encodeURIComponent(item.id);
}

async function loadData() {
  const date = requestedDate();
  const path = date ? "data/archive/" + date + ".json" : "data/latest.json";
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) throw new Error("브리핑 데이터를 불러오지 못했습니다.");

  state.data = await res.json();
  state.all = [].concat(state.data.contests || [], state.data.aiNews || [], state.data.aiDiscovery || [], state.data.support || []);
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
  $("#navDiscoveryCount").textContent = (data.aiDiscovery || []).length;
  $("#navSupportCount").textContent = (data.support || []).filter(isOpenItem).length;
}

function hideAllViews() {
  ["#homeView","#categoryView","#discoveryView","#archiveView","#detailView"].forEach(id => $(id).hidden = true);
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
    completeRoute("#/");
    return;
  }

  if (hash === "#/contests") {
    setActiveNav("contests");
    $("#categoryView").hidden = false;
    renderCategory("contests");
    document.title = "공모전 · 해커톤 | daily-brief";
    state.lastRoute = hash;
    completeRoute(hash);
    return;
  }

  if (hash === "#/ai-news") {
    setActiveNav("ai-news");
    $("#categoryView").hidden = false;
    renderCategory("ai-news");
    document.title = "AI 뉴스 | daily-brief";
    state.lastRoute = hash;
    completeRoute(hash);
    return;
  }

  if (hash === "#/ai-discovery") {
    setActiveNav("ai-discovery");
    $("#discoveryView").hidden = false;
    renderDiscoveryHub();
    document.title = "AI Discovery | daily-brief";
    state.lastRoute = hash;
    completeRoute(hash);
    return;
  }

  if (hash === "#/support") {
    setActiveNav("support");
    $("#categoryView").hidden = false;
    renderCategory("support");
    document.title = "지원사업 | daily-brief";
    state.lastRoute = hash;
    completeRoute(hash);
    return;
  }

  if (hash === "#/archive") {
    setActiveNav("archive");
    $("#archiveView").hidden = false;
    renderArchivePage();
    document.title = "아카이브 | daily-brief";
    state.lastRoute = hash;
    completeRoute(hash);
    return;
  }

  const m = hash.match(/^#\/(contest|ai|discovery|support)\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[2]);
    const item = state.all.find(x => x.id === id);
    if (item) {
      setActiveNav(m[1] === "ai" ? "ai-news" : m[1] === "discovery" ? "ai-discovery" : m[1] === "support" ? "support" : "contests");
      $("#detailView").hidden = false;
      renderDetail(item);
      document.title = item.title + " | daily-brief";
      completeRoute(hash);
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
  const category = kind === "support" ? "창업 · 지원사업" : "공모전 · 해커톤";

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
    const category = isAi ? "AI 뉴스" : kind === "support" ? "창업 · 지원사업" : "공모전 · 해커톤";
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
  const routeKey = type === "contests" ? "#/contests" : type === "ai-news" ? "#/ai-news" : "#/support";
  const savedView = state.viewStates[routeKey] || {};

  state.categoryFilter = savedView.categoryFilter || ((type === "ai-news" || type === "ai-discovery") ? "all" : "open");
  state.categoryTopicFilter = savedView.categoryTopicFilter || "all";
  state.categorySort = savedView.categorySort || (type === "ai-news" ? "updated" : type === "ai-discovery" ? "discovered" : "deadline");

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
    "ai-discovery": {
      eyebrow:"새 도구 · 사이트 · 저장소 · 워크플로",
      title:"AI Discovery",
      description:"사이트, GitHub, Skill, MCP, Agent, Workflow와 커뮤니티 발견을 하나의 카탈로그로 정리하고 도입 가치를 함께 기록합니다."
    },
    support: {
      eyebrow:"현재 신청 가능",
      title:"창업 · 지원사업",
      description:"사업자등록 전 예비창업자도 검토할 수 있는 사업화·보육·실증·크레딧·개발지원 기회를 모읍니다. 종료된 공고도 이력으로 보관합니다."
    }
  };

  const cfg = configs[type];
  $("#categoryEyebrow").textContent = cfg.eyebrow;
  $("#categoryTitle").textContent = cfg.title;
  $("#categoryDescription").textContent = cfg.description;

  const sort = $("#categorySort");
  if (type === "ai-news") {
    sort.innerHTML = '<option value="updated">최근 업데이트순</option><option value="discovered">최근 발견순</option>';
  } else if (type === "ai-discovery") {
    sort.innerHTML = '<option value="discovered">최근 발견순</option><option value="updated">최근 업데이트순</option>';
  } else {
    sort.innerHTML = '<option value="deadline">마감 임박순</option><option value="discovered">최근 발견순</option><option value="updated">최근 변경순</option>';
  }
  sort.value = state.categorySort;

  renderFilterChips(type);
  renderTopicChips(type);
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
  if (type === "ai-discovery") return [
    ["all","전체"],
    ["new","오늘 신규"],
    ["site","사이트"],
    ["github","GitHub"],
    ["skill","Skill"],
    ["mcp","MCP"],
    ["workflow","Workflow"],
    ["hot","HOT"],
    ["rising","RISING"],
    ["mainstream","WELL_KNOWN"]
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

const CONTEST_TOPIC_LABELS = {
  "ai-data": "AI · 데이터",
  "software": "소프트웨어 개발",
  "app-web": "앱 · 웹 서비스",
  "security": "보안",
  "fintech": "핀테크",
  "public-data": "공공데이터",
  "startup-product": "스타트업 · 프로덕트"
};

function contestTopic(item) {
  const explicit = String(item.contestCategory || item.categoryLabel || "").toLowerCase();
  const hay = [
    item.title,item.summary,item.description,item.evaluation,item.participation,item.categoryLabel
  ].concat(item.tags || []).join(" ").toLowerCase();

  if (/보안|security|cyber|사이버|취약점|해킹/.test(explicit + " " + hay)) return "security";
  if (/핀테크|fintech|금융|은행|결제|payment|보험/.test(explicit + " " + hay)) return "fintech";
  if (/공공데이터|govtech|공공서비스|공공 인프라|정부|지자체/.test(explicit + " " + hay)) return "public-data";
  if (/스타트업|startup|프로덕트|product|vibe coding|창업 해커톤/.test(explicit + " " + hay)) return "startup-product";
  if (/\bai\b|llm|rag|생성형|머신러닝|machine learning|딥러닝|deep learning|데이터 분석|컴퓨터비전|딥보이스|음성 ai/.test(explicit + " " + hay)) return "ai-data";
  if (/앱|모바일|android|ios|웹서비스|웹 서비스|web service|frontend|프론트엔드/.test(explicit + " " + hay)) return "app-web";
  return "software";
}

function contestTopicLabel(item) {
  return CONTEST_TOPIC_LABELS[contestTopic(item)] || "소프트웨어 개발";
}

function topicDefs(type) {
  if (type !== "contests") return [];
  return [
    ["all","전체 분야"],
    ["ai-data","AI · 데이터"],
    ["software","소프트웨어 개발"],
    ["app-web","앱 · 웹 서비스"],
    ["security","보안"],
    ["fintech","핀테크"],
    ["public-data","공공데이터"],
    ["startup-product","스타트업 · 프로덕트"]
  ];
}

function enableHorizontalDragScroll(el) {
  if (!el || el.dataset.dragScrollReady === "1") return;
  el.dataset.dragScrollReady = "1";

  const DRAG_THRESHOLD = 10;
  let startX = 0;
  let startScrollLeft = 0;
  let pointerId = null;
  let dragging = false;
  let suppressNextClick = false;

  el.addEventListener("pointerdown", e => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startScrollLeft = el.scrollLeft;
    dragging = false;
  });

  el.addEventListener("pointermove", e => {
    if (pointerId !== e.pointerId) return;
    const delta = e.clientX - startX;

    if (!dragging && Math.abs(delta) >= DRAG_THRESHOLD) {
      dragging = true;
      el.classList.add("dragging");
      el.setPointerCapture?.(pointerId);
    }

    if (dragging) {
      e.preventDefault();
      el.scrollLeft = startScrollLeft - delta;
    }
  });

  const finish = e => {
    if (pointerId !== e.pointerId) return;

    if (dragging) suppressNextClick = true;

    try { el.releasePointerCapture?.(pointerId); } catch (_) {}
    pointerId = null;
    dragging = false;
    el.classList.remove("dragging");
  };

  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);

  el.addEventListener("click", e => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}

function renderTopicChips(type) {
  const row = $("#categoryTopicRow");
  const el = $("#categoryTopicFilters");
  enableHorizontalDragScroll(el);
  const defs = topicDefs(type);
  row.hidden = defs.length === 0;
  if (!defs.length) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = defs.map(([key,label]) =>
    '<button class="filter-chip topic-chip ' + (key === state.categoryTopicFilter ? "active" : "") + '" data-topic="' + key + '">' + label + '</button>'
  ).join("");

  el.querySelectorAll(".topic-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      state.categoryTopicFilter = btn.dataset.topic;
      renderTopicChips(type);
      renderCategoryList(type);
    });
  });
}

function sourceFor(type) {
  if (type === "contests") return state.data.contests || [];
  if (type === "ai-news") return state.data.aiNews || [];
  if (type === "ai-discovery") return state.data.aiDiscovery || [];
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
  if (type === "ai-discovery" && ["site","github","skill","mcp","workflow"].includes(filter)) return String(item.discoveryType || "").toLowerCase() === filter;
  if (filter === "hot") return type === "ai-discovery" && String(item.trend || "").toUpperCase() === "HOT";
  if (filter === "rising") return type === "ai-discovery" && String(item.trend || "").toUpperCase() === "RISING";
  if (filter === "well-known") return type === "ai-discovery" && String(item.awareness || "").toUpperCase() === "WELL_KNOWN";
  if (filter === "opensource") return /open.?source|오픈소스|github|hugging face|mcp/i.test(hay);
  return true;
}

function renderCategoryList(type) {
  const source = sourceFor(type);
  let items = source.filter(item => matchesFilter(item, type, state.categoryFilter));
  if (type === "contests" && state.categoryTopicFilter !== "all") {
    items = items.filter(item => contestTopic(item) === state.categoryTopicFilter);
  }

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
  } else if (type === "ai-discovery") {
    $("#categoryCount").textContent = "전체 " + source.length + " · 오늘 신규 " + newCount;
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
  } else if (type === "ai-discovery") {
    el.innerHTML = items.map(item =>
      '<article class="category-card ai-category-card" data-id="' + esc(item.id) + '">' +
        '<div class="card-meta-row"><div class="card-status-group">' +
          changeBadge(item, "discovery") +
          '<span class="meta-label">' + esc(String(item.discoveryType || "site").toUpperCase()) + '</span>' +
          (item.awareness ? '<span class="meta-label">' + esc(item.awareness) + '</span>' : '') +
          (item.trend ? '<span class="meta-label">' + esc(item.trend) + '</span>' : '') +
          (item.newsState ? '<span class="meta-label">' + esc(item.newsState) + '</span>' : '') +
        '</div>' + dateMetaHtml(item, "ai") + '</div>' +
        '<h3 class="category-item-title">' + esc(item.title) + '</h3>' +
        '<p class="category-item-summary">' + esc(item.summary || "") + '</p>' +
        tagsHtml(item.tags) +
        '<div class="category-explainer"><span>왜 볼 가치가 있나</span><p>' + esc(txt(item.why || item.description || item.summary, "")) + '</p></div>' +
        '<div class="category-action">상세 정보와 링크 보기 <span>→</span></div>' +
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
            '<span class="meta-label">' + (kind === "support" ? "창업 · 지원사업" : contestTopicLabel(item)) + '</span>' +
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


const DISCOVERY_TYPE_LABELS = {
  site: "사이트",
  directory: "디렉터리",
  github: "GitHub",
  skill: "Skill",
  mcp: "MCP",
  agent: "Agent",
  workflow: "Workflow",
  discussion: "커뮤니티",
  platform: "플랫폼"
};

const DISCOVERY_AWARENESS_LABELS = {
  WELL_KNOWN: "널리 알려짐",
  SPECIALIZED: "특정 분야 중심",
  EARLY: "초기"
};

const DISCOVERY_TREND_LABELS = {
  HOT: "급부상",
  RISING: "상승세",
  STEADY: "꾸준함",
  RESURFACED: "재부상"
};

const DISCOVERY_NEWS_LABELS = {
  NEW_RELEASE: "새로 등장",
  NEWLY_DISCOVERED: "새로 발견",
  UPDATED: "주요 업데이트"
};

function discoveryLabel(map, value) {
  const key = String(value || "").toUpperCase();
  return map[key] || String(value || "");
}

function discoveryTypeLabel(value) {
  const key = String(value || "").toLowerCase();
  return DISCOVERY_TYPE_LABELS[key] || String(value || "");
}

function discoveryPrimaryGroup(item) {
  const type = String(item.discoveryType || "").toLowerCase();
  if (type === "github") return "github";
  if (["skill","mcp","agent"].includes(type)) return "agents";
  if (type === "workflow") return "workflows";

  const categories = (item.categories || []).map(v => String(v).toLowerCase());
  if (type === "directory" && categories.some(v => ["workflow","showcase"].includes(v))) return "workflows";
  if (["site","directory","platform"].includes(type)) return "sites";
  if (categories.some(v => ["skill","mcp","agent"].includes(v))) return "agents";
  if (categories.some(v => ["workflow","showcase","automation"].includes(v))) return "workflows";
  return "sites";
}

function discoveryRank(item) {
  const trendScore = { HOT: 50, RISING: 40, RESURFACED: 30, STEADY: 15 };
  const newsScore = { NEW_RELEASE: 35, UPDATED: 30, NEWLY_DISCOVERED: 20 };
  return (trendScore[String(item.trend || "").toUpperCase()] || 0) +
    (newsScore[String(item.newsState || "").toUpperCase()] || 0);
}

function discoverySignalBadges(item) {
  const parts = [
    discoveryTypeLabel(item.discoveryType),
    discoveryLabel(DISCOVERY_AWARENESS_LABELS, item.awareness),
    discoveryLabel(DISCOVERY_TREND_LABELS, item.trend),
    discoveryLabel(DISCOVERY_NEWS_LABELS, item.newsState)
  ].filter(Boolean);

  return '<div class="discovery-signals">' +
    parts.map((v,i) => '<span class="discovery-signal ' + (i === 2 ? "trend" : i === 3 ? "news" : "") + '">' + esc(v) + '</span>').join("") +
  '</div>';
}

function discoveryTopCard(item, index) {
  return '<article class="discovery-top-card ' + (index === 0 ? "primary" : "") + '" data-id="' + esc(item.id) + '">' +
    '<div class="discovery-top-index">0' + (index + 1) + '</div>' +
    discoverySignalBadges(item) +
    '<h3>' + esc(item.title) + '</h3>' +
    '<p>' + esc(item.summary || "") + '</p>' +
    '<div class="discovery-why"><span>왜 볼 가치가 있나</span><p>' + esc(txt(item.why || item.description || item.summary, "")) + '</p></div>' +
    '<div class="discovery-card-action">자세히 보기 <span>→</span></div>' +
  '</article>';
}

function discoveryRow(item) {
  return '<article class="discovery-row" data-id="' + esc(item.id) + '">' +
    '<div class="discovery-row-main">' +
      discoverySignalBadges(item) +
      '<h3>' + esc(item.title) + '</h3>' +
      '<p>' + esc(item.summary || "") + '</p>' +
      tagsHtml(item.categories || item.tags) +
    '</div>' +
    '<div class="discovery-row-side">' +
      '<span>왜 볼 가치가 있나</span>' +
      '<p>' + esc(cut(item.why || item.description || item.summary, 150)) + '</p>' +
    '</div>' +
  '</article>';
}

function discoveryGroup(title, eyebrow, items) {
  if (!items.length) return "";
  return '<section class="discovery-group">' +
    '<div class="discovery-section-head">' +
      '<div><p class="section-eyebrow">' + esc(eyebrow) + '</p><h2>' + esc(title) + '</h2></div>' +
      '<span>' + items.length + '개</span>' +
    '</div>' +
    '<div class="discovery-group-list">' + items.map(discoveryRow).join("") + '</div>' +
  '</section>';
}

function renderDiscoveryHub() {
  const items = state.data.aiDiscovery || [];
  const el = $("#discoveryHub");

  if (!items.length) {
    el.innerHTML = '<header class="discovery-head"><p class="section-eyebrow">AI Discovery</p><h1>AI Discovery</h1><p>새로운 도구와 워크플로를 발견하면 여기에 누적합니다.</p></header><div class="empty-state">아직 수집된 항목이 없습니다.</div>';
    return;
  }

  const ranked = items.slice().sort((a,b) => {
    const score = discoveryRank(b) - discoveryRank(a);
    if (score) return score;
    return String(b.firstSeenDate || "").localeCompare(String(a.firstSeenDate || ""));
  });
  const top = ranked.slice(0, Math.min(3, ranked.length));

  const groups = {
    sites: items.filter(x => discoveryPrimaryGroup(x) === "sites"),
    github: items.filter(x => discoveryPrimaryGroup(x) === "github"),
    agents: items.filter(x => discoveryPrimaryGroup(x) === "agents"),
    workflows: items.filter(x => discoveryPrimaryGroup(x) === "workflows")
  };

  const todayNew = items.filter(isNewToday).length;
  const rising = items.filter(x => ["HOT","RISING","RESURFACED"].includes(String(x.trend || "").toUpperCase())).length;

  el.innerHTML =
    '<header class="discovery-head">' +
      '<div><p class="section-eyebrow">AI Discovery</p><h1>놓치기 아까운 AI 도구와 방법들</h1>' +
      '<p>사이트, 오픈소스, Skill, MCP, Agent, Workflow를 한곳에 모으고 지금 왜 볼 가치가 있는지까지 정리합니다.</p></div>' +
      '<div class="discovery-stats">' +
        '<div><span>오늘 새로 발견</span><strong>' + todayNew + '</strong></div>' +
        '<div><span>상승 신호</span><strong>' + rising + '</strong></div>' +
        '<div><span>전체</span><strong>' + items.length + '</strong></div>' +
      '</div>' +
    '</header>' +

    '<section class="discovery-top">' +
      '<div class="discovery-section-head"><div><p class="section-eyebrow">먼저 볼 것</p><h2>Top Finds</h2></div><span>신호와 새 소식을 함께 반영</span></div>' +
      '<div class="discovery-top-grid">' + top.map(discoveryTopCard).join("") + '</div>' +
    '</section>' +

    '<div class="discovery-groups">' +
      discoveryGroup("사이트 · 디렉터리", "찾아볼 곳", groups.sites) +
      discoveryGroup("GitHub · 오픈소스", "코드로 볼 것", groups.github) +
      discoveryGroup("Skill · MCP · Agent", "에이전트 생태계", groups.agents) +
      discoveryGroup("Workflow · Showcase", "사용법과 조합", groups.workflows) +
    '</div>' +

    '<section class="discovery-all">' +
      '<div class="discovery-section-head"><div><p class="section-eyebrow">전체 기록</p><h2>Everything</h2></div><span>수집 단계에서는 버리지 않음</span></div>' +
      '<div class="discovery-filter-row" id="discoveryFilters">' +
        [["all","전체"],["new","오늘 발견"],["rising","상승세"],["site","사이트"],["directory","디렉터리"],["github","GitHub"],["skill","Skill"],["mcp","MCP"],["agent","Agent"],["workflow","Workflow"]]
          .map(([key,label]) => '<button class="filter-chip ' + (state.discoveryFilter === key ? "active" : "") + '" data-filter="' + key + '">' + label + '</button>').join("") +
      '</div>' +
      '<div class="discovery-all-list" id="discoveryAllList"></div>' +
    '</section>';

  renderDiscoveryAllList();

  el.querySelectorAll(".discovery-top-card, .discovery-row").forEach(card => {
    card.addEventListener("click", () => {
      state.lastRoute = "#/ai-discovery";
      const item = state.all.find(x => x.id === card.dataset.id);
      location.hash = itemRoute(item);
    });
  });

  $("#discoveryFilters").querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.discoveryFilter = btn.dataset.filter;
      $("#discoveryFilters").querySelectorAll("[data-filter]").forEach(x => x.classList.toggle("active", x.dataset.filter === state.discoveryFilter));
      renderDiscoveryAllList();
    });
  });
}

function matchesDiscoveryFilter(item, filter) {
  if (filter === "all") return true;
  if (filter === "new") return isNewToday(item);
  if (filter === "rising") return ["HOT","RISING","RESURFACED"].includes(String(item.trend || "").toUpperCase());
  return String(item.discoveryType || "").toLowerCase() === filter;
}

function renderDiscoveryAllList() {
  const el = $("#discoveryAllList");
  if (!el) return;

  const items = (state.data.aiDiscovery || [])
    .filter(item => matchesDiscoveryFilter(item, state.discoveryFilter))
    .sort((a,b) => {
      const score = discoveryRank(b) - discoveryRank(a);
      if (score) return score;
      return String(b.firstSeenDate || "").localeCompare(String(a.firstSeenDate || ""));
    });

  el.innerHTML = items.length
    ? items.map(discoveryRow).join("")
    : '<div class="empty-state">이 조건에 해당하는 Discovery가 없습니다.</div>';

  el.querySelectorAll(".discovery-row").forEach(card => {
    card.addEventListener("click", () => {
      state.lastRoute = "#/ai-discovery";
      const item = state.all.find(x => x.id === card.dataset.id);
      location.hash = itemRoute(item);
    });
  });
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
  else if (kind === "discovery") renderDiscoveryDetail(item);
  else renderOpportunityDetail(item, kind);
}

function renderOpportunityDetail(item, kind) {
  const category = kind === "support" ? "창업 · 지원사업" : contestTopicLabel(item);
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

function renderDiscoveryDetail(item) {
  const links = item.links || [];
  const related = item.related || [];
  $("#detailHeader").innerHTML =
    '<div class="detail-kicker">' + changeBadge(item, "discovery") +
      '<span class="detail-pill">' + esc(String(item.discoveryType || "site").toUpperCase()) + '</span>' +
      (item.awareness ? '<span class="detail-pill">' + esc(item.awareness) + '</span>' : '') +
      (item.trend ? '<span class="detail-pill">' + esc(item.trend) + '</span>' : '') +
      (item.newsState ? '<span class="detail-pill">' + esc(item.newsState) + '</span>' : '') +
    '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.summary || "") + '</p>' +
    '<div class="detail-date-line"><span><b>발견일</b> ' + esc(shortDate(item.firstSeenDate)) + '</span><span><b>최종 확인</b> ' + esc(shortDate(item.lastUpdatedDate || item.firstSeenDate)) + '</span></div>';

  $("#detailTopActions").innerHTML = links.slice(0,2).map((l,i) =>
    '<a class="' + (i === 0 ? "primary-link" : "secondary-link") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' ↗</a>'
  ).join("");

  $("#detailContent").innerHTML =
    infoBlock("무엇인가","",[["설명", item.description || item.summary],["왜 볼 가치가 있나", item.why],["발견 이유", item.discoveryReason]]) +
    infoBlock("현재 신호","",[["인지도", item.awareness],["트렌드", item.trend],["새 소식", item.newsState]]) +
    infoBlock("신호","",[["발견 경로", (item.signals || []).join(" · ")],["카테고리", (item.categories || []).join(" · ")]]) +
    (related.length ? ideaBlock("연결된 항목", related) : "") +
    (links.length ? '<section class="detail-block"><h2>링크</h2><div class="official-link-list">' + links.map(l => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><span>' + esc(l.label) + '</span><span>↗</span></a>').join("") + '</div></section>' : '');

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
  hydrateViewStates();
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  window.addEventListener("hashchange", () => {
    saveViewState(state.activeRoute);
    route();
  });

  window.addEventListener("pagehide", () => saveViewState(state.activeRoute));

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
      [x.title,x.summary,x.description,x.why,x.discoveryReason]
        .concat(x.tags || [])
        .concat(x.categories || [])
        .concat(x.signals || [])
        .concat(x.related || [])
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