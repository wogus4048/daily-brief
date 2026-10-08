const state = {
  data: null,
  all: [],
  lastRoute: "#/",
  categoryFilter: "all",
  categoryTopicFilter: "all",
  categorySort: "deadline",
  activeRoute: null,
  viewStates: {},
  discoveryFilter: "all",
  discoveryStatus: "all",
  discoverySource: "all"
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
  if (isNewToday(item)) return '<span class="IssueLabel change-badge new">신규 등록</span>';
  if (kind === "ai" && isUpdatedToday(item)) return '<span class="IssueLabel change-badge updated">당일 수정</span>';
  return "";
}

function dateMetaHtml(item, kind) {
  const first = shortDate(item.firstSeenDate);
  const second = kind === "ai"
    ? shortDate(item.lastUpdatedDate || item.firstSeenDate)
    : shortDate(item.lastVerifiedDate || item.firstSeenDate);
  const secondLabel = kind === "ai" ? "수정일" : "확인일";

  return '<div class="card-date-meta">' +
    (first ? '<span><b>등록일</b> ' + esc(first) + '</span>' : '') +
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
  $("#topbarDate").setAttribute("datetime", data.date);
  const archiveNotice = $("#archiveNotice");
  archiveNotice.hidden = !requestedDate();
  if (requestedDate()) archiveNotice.innerHTML = esc(formatDate(data.date)) + '에 저장된 브리핑입니다. <a href="' + esc(location.pathname) + '#/">최신 브리핑 보기</a>';
  $("#year").textContent = new Date().getFullYear();
  const set = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
  const contestCount = (data.contests || []).filter(isOpenItem).length;
  const aiCount = (data.aiNews || []).length;
  const discoveryCount = (data.aiDiscovery || []).length;
  const supportCount = (data.support || []).filter(isOpenItem).length;
  set("#navContestCount", contestCount);
  set("#navAiCount", aiCount);
  set("#navDiscoveryCount", discoveryCount);
  set("#navSupportCount", supportCount);
  set("#topNavContestCount", contestCount);
  set("#topNavAiCount", aiCount);
  set("#topNavDiscoveryCount", discoveryCount);
  set("#topNavSupportCount", supportCount);
  renderGlobalShellData();
}

function renderGlobalShellData() {
  const contests = state.data.contests || [];
  const news = state.data.aiNews || [];
  const discovery = state.data.aiDiscovery || [];
  const support = state.data.support || [];
  const openContests = contests.filter(isOpenItem);
  const openSupport = support.filter(isOpenItem);
  const newToday = items => items.filter(isNewToday).length;
  const totalNewToday = newToday(contests) + newToday(news) + newToday(discovery) + newToday(support);
  const set = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };

  set("#leftTodayCount", state.all.length);
  set("#leftNewCount", totalNewToday);
  set("#leftUpdatedCount", state.all.filter(x => isUpdatedToday(x) || (itemKind(x) === "discovery" && String(x.newsState || "").toUpperCase() === "UPDATED")).length);
  set("#leftRisingCount", discovery.filter(x => ["HOT","RISING","RESURFACED"].includes(String(x.trend || "").toUpperCase())).length);
  set("#leftUrgentCount", [].concat(openContests, openSupport).filter(withinWeek).length);
  set("#leftToolCount", discovery.filter(x => ["site","directory","platform","workflow"].includes(String(x.discoveryType || "").toLowerCase())).length);
  set("#leftGithubCount", discovery.filter(x => String(x.discoveryType || "").toLowerCase() === "github").length);
  set("#leftAgentCount", discovery.filter(x => ["mcp","skill","agent"].includes(String(x.discoveryType || "").toLowerCase())).length);
  set("#homeRightNewCount", totalNewToday);

  renderHomeTrending();
  renderHomeRightUpcoming();
  renderHomeRightNew();
  renderHomeRightUpdated();
  renderHomeLeftArchive();
}

function hideAllViews() {
  ["#homeView","#categoryView","#discoveryView","#archiveView","#detailView"].forEach(id => $(id).hidden = true);
}

function setActiveNav(routeName) {
  document.querySelectorAll(".nav-item, .mobile-tab").forEach(el => {
    const selected = el.dataset.route === routeName;
    el.classList.toggle("active", selected);
    el.classList.toggle("selected", selected);
    if (selected) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    if (el.tagName === "ION-TAB-BUTTON") el.selected = selected;
  });
}

function route() {
  if (!state.data) return;

  const hash = location.hash || "#/";
  document.body.dataset.page = hash === "#/" || hash === "#" ? "home" : hash.split("/").length > 2 ? "detail" : hash.slice(2);
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
  const discovery = state.data.aiDiscovery || [];
  const support = state.data.support || [];

  const openContests = contests.filter(isOpenItem);
  const openSupport = support.filter(isOpenItem);
  const newToday = items => items.filter(isNewToday).length;
  const totalNewToday = newToday(contests) + newToday(news) + newToday(discovery) + newToday(support);

  const set = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
  set("#homeDateLabel", state.data.date);
  set("#homeTotalCount", state.all.length);
  set("#homeNewTotal", totalNewToday);

  renderHomeFeed();
}

function homeSignalScore(item) {
  const kind = itemKind(item);
  if (kind === "discovery") {
    return 90 + discoveryRank(item) + (isNewToday(item) ? 18 : 0);
  }
  if (kind === "ai") {
    return 78 + (isNewToday(item) ? 28 : 0) + (isUpdatedToday(item) ? 18 : 0);
  }
  if (!isOpenItem(item)) return 5;
  const d = ddayNumber(item);
  const urgency = d === null ? 8 : Math.max(0, 46 - Math.min(d, 46));
  return 42 + urgency + (isNewToday(item) ? 18 : 0);
}

function homeSignalLabel(item) {
  const kind = itemKind(item);
  if (kind === "ai") return "AI 뉴스";
  if (kind === "discovery") {
    const type = String(item.discoveryType || "").toLowerCase();
    if (type === "github") return "오픈소스";
    return discoveryPurposeLabel(item) || "AI 자료";
  }
  if (kind === "support") return "지원사업";
  return "공모전";
}

function homeSignalTone(item) {
  const kind = itemKind(item);
  if (kind === "support") return "support";
  if (kind === "contest") return "contest";
  if (kind === "ai") return "ai";
  if (String(item.discoveryType || "").toLowerCase() === "github") return "opensource";
  return "resource";
}

function homeSignalStatus(item) {
  const kind = itemKind(item);
  if (kind === "discovery") {
    return discoveryLabel(DISCOVERY_TREND_LABELS, item.trend) || discoveryLabel(DISCOVERY_NEWS_LABELS, item.newsState);
  }
  if (kind === "ai") {
    if (isNewToday(item)) return "오늘 새로";
    if (isUpdatedToday(item)) return "최근 업데이트";
    return "확인 완료";
  }
  return !isOpenItem(item) ? "종료" : (item.dDay || "진행 중");
}

function homeSignalMeta(item) {
  const kind = itemKind(item);
  if (kind === "discovery") {
    return [discoveryPurposeLabel(item), (item.categories || []).slice(0,2).join(" · ")].filter(Boolean).join(" · ");
  }
  if (kind === "ai") return (item.tags || []).slice(0,3).join(" · ") || "AI";
  return item.deadlineText || item.dDay || item.categoryLabel || "";
}

function rankedHomeSignals(limit) {
  return state.all.slice().sort((a,b) => {
    const score = homeSignalScore(b) - homeSignalScore(a);
    if (score) return score;
    return latestDateValue(b).localeCompare(latestDateValue(a));
  }).slice(0, limit);
}

function homeFeedIcon(item) {
  const kind = itemKind(item);
  if (kind === "ai") return "sparkles-outline";
  if (kind === "contest") return "trophy-outline";
  if (kind === "support") return "briefcase-outline";
  const type = String(item.discoveryType || "").toLowerCase();
  if (type === "github") return "logo-github";
  if (type === "mcp") return "git-network-outline";
  if (type === "skill") return "construct-outline";
  if (type === "agent") return "hardware-chip-outline";
  if (type === "workflow") return "git-branch-outline";
  return "link-outline";
}

function homeFeedTags(item) {
  const values = itemKind(item) === "discovery" ? (item.categories || item.tags || []) : (item.tags || []);
  return values.slice(0,3).join(" · ") || homeSignalLabel(item);
}

function homeBriefingSections() {
  const available = state.all.filter(item => !['contest','support'].includes(itemKind(item)) || isOpenItem(item));
  const urgent = available.filter(item => ['contest','support'].includes(itemKind(item)) && withinWeek(item)).sort((a,b)=>ddayNumber(a)-ddayNumber(b));
  const urgentIds = new Set(urgent.map(item=>item.id));
  const fresh = available.filter(item=>isNewToday(item) && !urgentIds.has(item.id));
  const updated = available.filter(item=>isUpdatedToday(item) && !isNewToday(item) && !urgentIds.has(item.id));
  const rank = items => items.sort((a,b)=>homeSignalScore(b)-homeSignalScore(a));
  return [
    {id:'new',title:'새로 들어온 소식',description:'자료 기준일에 처음 등록된 정보',items:rank(fresh),empty:'자료 기준일에 새로 등록된 소식이 없습니다.'},
    {id:'updated',title:'달라진 내용',description:'기존 항목 중 자료 기준일에 수정된 정보',items:rank(updated),empty:'자료 기준일에 수정된 내용이 없습니다.'},
    {id:'urgent',title:'놓치기 전에',description:'자료 기준일부터 7일 이내 마감 · 가까운 일정순',items:urgent,empty:'7일 이내 마감되는 공모전·지원사업이 없습니다.'}
  ];
}

function homeBriefingRow(item,index) {
  return '<ion-item class="product-row" button="true" detail="false" lines="inset" mode="ios" data-id="' + esc(item.id) + '">' +
      '<div class="product-row-content">' +
        '<div class="product-rank">' + String(index + 1).padStart(2,"0") + '</div>' +
        '<div class="product-icon tone-' + homeSignalTone(item) + '"><ion-icon name="' + esc(homeFeedIcon(item)) + '" aria-hidden="true"></ion-icon></div>' +
        '<div class="product-body">' +
          '<div class="product-title-line"><h3>' + esc(item.title) + '</h3><span>' + esc(homeSignalLabel(item)) + '</span></div>' +
          '<p>' + esc(cut(item.summary || item.description || "", 155)) + '</p>' +
          '<div class="product-meta"><span>' + esc(homeFeedTags(item)) + '</span></div>' +
        '</div>' +
        '<div class="product-side"><strong class="' + (['contest','support'].includes(itemKind(item)) && isOpenItem(item) && withinWeek(item) ? 'deadline-urgent' : '') + '">' + esc(homeSignalStatus(item)) + '</strong><span>' + esc(cut(homeSignalMeta(item), 44)) + '</span></div>' +
      '</div>' +
    '</ion-item>';
}

function renderHomeFeed() {
  const el = $('#homeFeed');
  if (!el) return;
  el.innerHTML = homeBriefingSections().map(section => '<section class="briefing-section" data-briefing-section="'+section.id+'" aria-labelledby="briefing-'+section.id+'">'+
    '<header class="briefing-section-head"><div><h2 id="briefing-'+section.id+'">'+section.title+'</h2><p>'+section.description+'</p></div><span>'+section.items.length+'개'+(section.items.length>5?' 중 5개':'')+'</span></header>'+
    (section.items.length ? section.items.slice(0,5).map(homeBriefingRow).join('') : '<p class="briefing-empty">'+section.empty+'</p>')+'</section>').join('')+
    '<nav class="briefing-browse" aria-label="전체 자료 탐색"><span>전체 자료 보기</span><a href="#/ai-news">AI 뉴스</a><a href="#/ai-discovery">Discovery</a><a href="#/contests">공모전</a><a href="#/support">지원사업</a></nav>';
  wireHomeRows(el);
  renderHomeRightUpcoming();
}

function renderHomeRightUpcoming() {
  const el = $("#homeRightUpcoming");
  if (!el) return;
  const items = [].concat(state.data.contests || [], state.data.support || [])
    .filter(item => isOpenItem(item) && ddayNumber(item) !== null && ddayNumber(item) >= 0)
    .sort((a,b) => ddayNumber(a) - ddayNumber(b))
    .slice(0,5);
  el.innerHTML = items.map(item =>
    '<a class="right-row" href="' + itemRoute(item) + '"><strong>' + esc(item.dDay || "진행 중") + '</strong><span>' + esc(item.title) + '</span></a>'
  ).join("") || '<div class="right-empty">확인된 마감이 없습니다.</div>';
}

function renderHomeRightNew() {
  const el = $("#homeRightNew");
  if (!el) return;
  const items = state.all.filter(isNewToday).sort((a,b) => homeSignalScore(b) - homeSignalScore(a)).slice(0,5);
  el.innerHTML = items.map(item =>
    '<a class="right-row simple" href="' + itemRoute(item) + '"><span>' + esc(item.title) + '</span><em>' + esc(homeSignalLabel(item)) + '</em></a>'
  ).join("") || '<div class="right-empty">해당 날짜에 등록된 정보가 없습니다.</div>';
}

function renderHomeRightUpdated() {
  const el = $("#homeRightUpdated");
  if (!el) return;
  const items = state.all
    .filter(item => isUpdatedToday(item) || (itemKind(item) === "discovery" && String(item.newsState || "").toUpperCase() === "UPDATED"))
    .sort((a,b) => latestDateValue(b).localeCompare(latestDateValue(a)))
    .slice(0,5);
  el.innerHTML = items.map(item =>
    '<a class="right-row simple" href="' + itemRoute(item) + '"><span>' + esc(item.title) + '</span><em>업데이트</em></a>'
  ).join("") || '<div class="right-empty">해당 날짜에 수정된 정보가 없습니다.</div>';
}

function renderHomeLeftArchive() {
  const el = $("#homeLeftArchive");
  if (!el) return;
  const days = (state.data.archive || []).slice(0,5);
  el.innerHTML = days.map(date => {
    const label = shortDate(date);
    const href = '?date=' + encodeURIComponent(date) + '#/';
    return '<a class="side-link archive-link" href="' + href + '"><span>' + esc(label) + '</span></a>';
  }).join("");
}

function wireHomeRows(root) {
  if (!root) return;
  root.querySelectorAll("[data-id]").forEach(row => {
    row.addEventListener("click", () => {
      const item = state.all.find(x => x.id === row.dataset.id);
      if (!item) return;
      state.lastRoute = "#/";
      if (row.tagName !== "A") location.hash = itemRoute(item);
    });
  });
}

function renderHomeTopSignals() {
  const el = $("#homeTopSignals");
  const items = rankedHomeSignals(6);
  el.innerHTML = items.map((item,index) =>
    '<a class="top-signal-row" href="' + itemRoute(item) + '" data-id="' + esc(item.id) + '">' +
      '<div class="signal-rank">' + String(index + 1).padStart(2,"0") + '</div>' +
      '<div class="signal-main"><div class="signal-kicker"><span class="IssueLabel signal-category tone-' + homeSignalTone(item) + '">' + esc(homeSignalLabel(item)) + '</span><span class="IssueLabel signal-state">' + esc(homeSignalStatus(item)) + '</span></div>' +
      '<h3>' + esc(item.title) + '</h3><p>' + esc(item.summary || "") + '</p>' +
      (item.why ? '<div class="why-line"><b>주요 특징</b><span>' + esc(cut(item.why, 155)) + '</span></div>' : '') + '</div>' +
      '<div class="signal-arrow">↗</div>' +
    '</a>'
  ).join("");
  wireHomeRows(el);
}

function renderHomeTrending() {
  const scores = new Map();
  const add = (label, weight = 1) => {
    const key = String(label || "").trim();
    if (!key || /^(ai|site|showcase|resource)$/i.test(key)) return;
    scores.set(key, (scores.get(key) || 0) + weight);
  };

  (state.data.aiNews || []).forEach(item => (item.tags || []).forEach(tag => add(tag, isNewToday(item) || isUpdatedToday(item) ? 2 : 1)));
  (state.data.aiDiscovery || []).forEach(item => {
    const weight = String(item.trend || "").toUpperCase() === "HOT" ? 4 : String(item.trend || "").toUpperCase() === "RISING" ? 3 : 1;
    (item.categories || []).forEach(tag => add(tag, weight));
  });

  const rows = [...scores.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0,6);
  $("#homeTrending").innerHTML = rows.map(([label,count]) =>
    '<div class="right-topic"><span>' + esc(label) + '</span><strong>' + count + '</strong></div>'
  ).join("");
}

function renderHomeSources() {
  const counts = new Map();
  state.all.forEach(item => (item.links || []).forEach(link => {
    try {
      const domain = new URL(link.url).hostname.replace(/^www\./, "");
      if (domain) counts.set(domain, (counts.get(domain) || 0) + 1);
    } catch (_) {}
  }));
  const rows = [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0,6);
  $("#homeSources").innerHTML = rows.map(([domain,count]) =>
    '<div class="rail-row source-row"><strong>' + esc(domain) + '</strong><span class="rail-value">' + count + '</span></div>'
  ).join("");
}

function renderHomeExplore() {
  const discovery = state.data.aiDiscovery || [];
  const openContests = (state.data.contests || []).filter(isOpenItem);
  const openSupport = (state.data.support || []).filter(isOpenItem);
  const groups = [
    {title:"AI 뉴스", tone:"ai", href:"#/ai-news", count:(state.data.aiNews || []).length, items:newsPriority(state.data.aiNews || []).slice(0,3)},
    {title:"AI Discovery", tone:"resource", href:"#/ai-discovery", count:discovery.length, items:discovery.slice().sort((a,b)=>discoveryRank(b)-discoveryRank(a)).slice(0,3)},
    {title:"GitHub · 오픈소스", tone:"opensource", href:"#/ai-discovery", count:discovery.filter(x=>String(x.discoveryType||"").toLowerCase()==="github").length, items:discovery.filter(x=>String(x.discoveryType||"").toLowerCase()==="github").slice(0,3)},
    {title:"도구 · 워크플로", tone:"resource", href:"#/ai-discovery", count:discovery.filter(x=>["skill","mcp","agent","workflow","site","platform"].includes(String(x.discoveryType||"").toLowerCase())).length, items:discovery.filter(x=>["skill","mcp","agent","workflow","site","platform"].includes(String(x.discoveryType||"").toLowerCase())).slice(0,3)},
    {title:"공모전 · 해커톤", tone:"contest", href:"#/contests", count:openContests.length, items:opportunityPriority(openContests).slice(0,3)},
    {title:"창업 · 지원사업", tone:"support", href:"#/support", count:openSupport.length, items:opportunityPriority(openSupport).slice(0,3)}
  ];

  $("#homeExplore").innerHTML = groups.map(group =>
    '<section class="explore-cell tone-' + group.tone + '"><a class="explore-cell-head" href="' + group.href + '"><h3>' + esc(group.title) + '</h3><span>' + group.count + '</span></a>' +
    '<div class="explore-items">' + (group.items.length ? group.items.map(item =>
      '<a class="explore-item" href="' + itemRoute(item) + '" data-id="' + esc(item.id) + '"><span>' + esc(item.title) + '</span><b>→</b></a>'
    ).join("") : '<div class="explore-empty">표시할 항목 없음</div>') + '</div></section>'
  ).join("");
  wireHomeRows($("#homeExplore"));
}

function renderHomeAllSignals() {
  const items = rankedHomeSignals(18);
  $("#homeSignalCount").textContent = "전체 " + state.all.length + "개 중 " + items.length + "개 표시";
  const el = $("#homeAllSignals");
  el.innerHTML = items.map(item =>
    '<a class="signal-table-row" href="' + itemRoute(item) + '" data-id="' + esc(item.id) + '">' +
      '<div class="IssueLabel signal-type tone-' + homeSignalTone(item) + '">' + esc(homeSignalLabel(item)) + '</div>' +
      '<div class="signal-title"><strong>' + esc(item.title) + '</strong><span>' + esc(cut(item.summary || "", 105)) + '</span></div>' +
      '<div class="signal-meta">' + esc(cut(homeSignalMeta(item), 72)) + '</div>' +
      '<div class="signal-status">' + esc(homeSignalStatus(item)) + '</div>' +
    '</a>'
  ).join("");
  wireHomeRows(el);
}

function renderHomeResources() {
  const items = (state.data.aiDiscovery || []).slice().sort((a,b)=>discoveryRank(b)-discoveryRank(a)).slice(0,6);
  const el = $("#homeResources");
  el.innerHTML = items.map(item => {
    let domain = "";
    try { domain = new URL((item.links || [])[0]?.url || "").hostname.replace(/^www\./, ""); } catch (_) {}
    const tone = String(item.discoveryType || "").toLowerCase() === "github" ? "opensource" : "resource";
    return '<a class="resource-item tone-' + tone + '" href="' + itemRoute(item) + '" data-id="' + esc(item.id) + '"><div><strong>' + esc(item.title) + '</strong><span>' + esc(discoveryPurposeLabel(item)) + '</span></div><small>' + esc(domain) + '</small></a>';
  }).join("");
  wireHomeRows(el);
}

function renderHomeUpcoming() {
  const items = [].concat(state.data.contests || [], state.data.support || [])
    .filter(item => isOpenItem(item) && ddayNumber(item) !== null && ddayNumber(item) >= 0)
    .sort((a,b) => ddayNumber(a) - ddayNumber(b))
    .slice(0,7);
  const el = $("#homeUpcoming");
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">현재 D-day가 확인된 진행 중 마감이 없습니다.</div>';
    return;
  }
  el.innerHTML = items.map(item =>
    '<a class="upcoming-row" href="' + itemRoute(item) + '" data-id="' + esc(item.id) + '"><span class="upcoming-date">' + esc(item.dDay || "진행 중") + '</span><strong>' + esc(item.title) + '</strong><span class="upcoming-kind">' + (itemKind(item) === "support" ? "지원사업" : "공모전") + '</span><span class="signal-arrow">↗</span></a>'
  ).join("");
  wireHomeRows(el);
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
    const isDiscovery = kind === "discovery";
    const category = isAi ? "AI 뉴스" : isDiscovery ? "AI Discovery" : kind === "support" ? "창업 · 지원사업" : "공모전 · 해커톤";
    const primaryStatus = isAi
      ? ""
      : isDiscovery
        ? (item.trend ? '<span class="compact-status signal">' + esc(discoveryLabel(DISCOVERY_TREND_LABELS, item.trend)) + '</span>' : "")
        : '<span class="compact-status ' + dangerClass(item) + '">' + esc(!isOpenItem(item) ? "종료" : (item.dDay || "접수중")) + '</span>';

    const foot = isAi
      ? ((item.tags || []).slice(0,3).join(" · ") || "AI")
      : isDiscovery
        ? [discoveryPurposeLabel(item), discoveryLabel(DISCOVERY_AWARENESS_LABELS, item.awareness)].filter(Boolean).join(" · ")
        : "마감 " + txt(item.deadlineText || item.dDay);

    return '<article class="compact-item compact-flow" data-id="' + esc(item.id) + '">' +
      '<div class="card-meta-row">' +
        '<div class="card-status-group">' +
          changeBadge(item, kind) +
          primaryStatus +
          '<span class="compact-category">' + category + '</span>' +
        '</div>' +
        dateMetaHtml(item, (isAi || isDiscovery) ? "ai" : kind) +
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
      eyebrow:"접수 일정 · 참가 자격",
      title:"공모전 · 해커톤",
      description:"공모전과 해커톤의 접수 일정, 참가 자격, 상금을 확인하세요."
    },
    "ai-news": {
      eyebrow:"새 소식 · 후속 업데이트",
      title:"AI 뉴스",
      description:"AI 제품과 기술의 주요 발표, 후속 소식을 정리했습니다."
    },
    "ai-discovery": {
      eyebrow:"새 도구 · 사이트 · 저장소 · 워크플로",
      title:"AI Discovery",
      description:"사이트, GitHub, Skill, MCP, Agent, Workflow를 한곳에 모아 무엇에 쓰는지와 최근 변화까지 함께 정리합니다."
    },
    support: {
      eyebrow:"지원 내용 · 신청 자격",
      title:"창업 · 지원사업",
      description:"창업 지원금, 입주 공간, 교육과 개발 지원을 확인하세요."
    }
  };

  const cfg = configs[type];
  $("#categoryEyebrow").textContent = cfg.eyebrow;
  $("#categoryTitle").textContent = cfg.title;
  $("#categoryDescription").textContent = cfg.description;

  const categoryList = $("#categoryList");
  categoryList.classList.toggle("opportunity-grid", type === "contests" || type === "support");

  const sort = $("#categorySort");
  if (type === "ai-news") {
    sort.innerHTML = '<ion-select-option value="updated">최근 수정순</ion-select-option><ion-select-option value="discovered">등록일순</ion-select-option>';
  } else if (type === "ai-discovery") {
    sort.innerHTML = '<ion-select-option value="discovered">등록일순</ion-select-option><ion-select-option value="updated">최근 수정순</ion-select-option>';
  } else {
    sort.innerHTML = '<ion-select-option value="deadline">마감일순</ion-select-option><ion-select-option value="discovered">등록일순</ion-select-option><ion-select-option value="updated">최근 수정순</ion-select-option>';
  }
  sort.value = state.categorySort;

  renderFilterChips(type);
  renderTopicChips(type);
  renderCategoryList(type);
}

function filterDefs(type) {
  if (type === "contests") return [
    ["open","모집 중·예정"],
    ["new","신규 등록"],
    ["urgent","7일 이내"],
    ["individual","개인·1인"],
    ["closed","종료"],
    ["all","전체"]
  ];
  if (type === "ai-news") return [
    ["all","전체 이슈"],
    ["new","신규 등록"],
    ["updated","당일 수정"],
    ["agent","에이전트"],
    ["coding","코딩 AI"],
    ["opensource","MCP·오픈소스"],
    ["security","보안"]
  ];
  if (type === "ai-discovery") return [
    ["all","전체"],
    ["new","신규 등록"],
    ["site","사이트"],
    ["github","GitHub"],
    ["skill","Skill"],
    ["mcp","MCP"],
    ["workflow","Workflow"],
    ["hot","급부상"],
    ["rising","관심 증가"],
    ["mainstream","많이 알려짐"]
  ];
  return [
    ["open","모집 중·예정"],
    ["new","신규 등록"],
    ["urgent","7일 이내"],
    ["prestart","예비창업"],
    ["closed","종료"],
    ["all","전체"]
  ];
}

function renderFilterChips(type) {
  const el = $("#categoryFilters");
  el.innerHTML = filterDefs(type).map(([key,label]) =>
    '<ion-chip role="button" tabindex="0" aria-pressed="' + (key === state.categoryFilter) + '" class="filter-chip ' + (key === state.categoryFilter ? "selected active" : "") + '" data-filter="' + key + '" mode="ios"><ion-label>' + label + '</ion-label></ion-chip>'
  ).join("");

  el.querySelectorAll(".filter-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const restoreFocus = document.activeElement === btn;
      state.categoryFilter = btn.dataset.filter;
      renderFilterChips(type);
      renderCategoryList(type);
      if (restoreFocus) el.querySelector('[data-filter="' + state.categoryFilter + '"]')?.focus({preventScroll: true});
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
    '<ion-chip role="button" tabindex="0" aria-pressed="' + (key === state.categoryTopicFilter) + '" class="filter-chip topic-chip ' + (key === state.categoryTopicFilter ? "active" : "") + '" data-topic="' + key + '" mode="ios"><ion-label>' + label + '</ion-label></ion-chip>'
  ).join("");

  el.querySelectorAll(".topic-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const restoreFocus = document.activeElement === btn;
      state.categoryTopicFilter = btn.dataset.topic;
      renderTopicChips(type);
      renderCategoryList(type);
      if (restoreFocus) el.querySelector('[data-topic="' + state.categoryTopicFilter + '"]')?.focus({preventScroll: true});
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
    $("#categoryCount").textContent = "전체 " + source.length + " · 신규 등록 " + newCount + " · 업데이트 " + updatedCount;
  } else if (type === "ai-discovery") {
    $("#categoryCount").textContent = "전체 " + source.length + " · 신규 등록 " + newCount;
  } else {
    const openCount = source.filter(isOpenItem).length;
    $("#categoryCount").textContent = "모집 중·예정 " + openCount + " · 신규 등록 " + newCount + " · 전체 " + source.length;
  }

  const resultLabel = type === "ai-news" ? "소식" : "공고";
  $("#categoryResultCount").innerHTML = resultLabel + ' <strong>' + items.length + '</strong>건';
  const defaultFilter = type === "ai-news" ? "all" : "open";
  $("#resetCategoryFilters").disabled = state.categoryFilter === defaultFilter && state.categoryTopicFilter === "all";
  const el = $("#categoryList");
  if (!items.length) {
    el.innerHTML = '<div class="empty-state"><ion-icon name="filter-outline" aria-hidden="true"></ion-icon><strong>조건에 맞는 결과가 없습니다</strong><p>필터를 초기화하거나 다른 조건을 선택해 주세요.</p></div>';
    return;
  }

  if (type === "ai-news") {
    el.innerHTML = items.map(item =>
      '<ion-item class="category-card ai-category-card tone-ai" button="true" detail="false" lines="inset" mode="ios" data-id="' + esc(item.id) + '">' +
        '<div class="news-row-content"><div class="card-meta-row">' +
          '<div class="card-status-group">' +
            changeBadge(item, "ai") +
          '</div>' +
          '<span class="news-date">' + (item.lastUpdatedDate ? '수정 ' : '등록 ') + esc(shortDate(item.lastUpdatedDate || item.firstSeenDate)) + '</span>' +
        '</div>' +
        '<h3 class="category-item-title">' + esc(item.title) + '</h3>' +
        '<p class="category-item-summary">' + esc(item.summary || "") + '</p>' +
        tagsHtml(item.tags) +
        '</div>' +
      '</ion-item>'
    ).join("");
  } else if (type === "ai-discovery") {
    el.innerHTML = items.map(item =>
      '<ion-item class="category-card ai-category-card tone-' + (String(item.discoveryType || "").toLowerCase() === "github" ? "opensource" : "resource") + '" button="true" detail="false" lines="inset" mode="ios" data-id="' + esc(item.id) + '">' +
        '<div class="news-row-content"><div class="card-meta-row"><div class="card-status-group">' +
          changeBadge(item, "discovery") +
          '<span class="meta-label">' + esc(discoveryPurposeLabel(item)) + '</span>' +
          (item.awareness ? '<span class="meta-label">' + esc(discoveryLabel(DISCOVERY_AWARENESS_LABELS, item.awareness)) + '</span>' : '') +
          (item.trend ? '<span class="meta-label">' + esc(discoveryLabel(DISCOVERY_TREND_LABELS, item.trend)) + '</span>' : '') +
          (item.newsState ? '<span class="meta-label">' + esc(discoveryLabel(DISCOVERY_NEWS_LABELS, item.newsState)) + '</span>' : '') +
        '</div>' + dateMetaHtml(item, "ai") + '</div>' +
        '<h3 class="category-item-title">' + esc(item.title) + '</h3>' +
        '<p class="category-item-summary">' + esc(item.summary || "") + '</p>' +
        tagsHtml(item.tags) +
        '<div class="category-explainer"><span>주요 특징</span><p>' + esc(txt(item.why || item.description || item.summary, "")) + '</p></div>' +
        '<div class="category-action">상세 정보와 링크 보기</div></div>' +
      '</ion-item>'
    ).join("");
  } else {
    const kind = type === "support" ? "support" : "contest";
    const iconName = kind === "support" ? "briefcase-outline" : "trophy-outline";

    el.innerHTML = '<div class="opportunity-grid-inner">' + items.map(item => {
      const status = !isOpenItem(item) ? "종료" : String(item.status).toUpperCase() === "UPCOMING" ? "접수 예정" : (item.dDay || "접수 중");
      const category = kind === "support" ? "창업 · 지원사업" : contestTopicLabel(item);
      const tags = (item.tags || []).slice(0, 3);
      const deadline = item.deadlineText || item.dDay || "일정 확인";

      return '<ion-card href="' + itemRoute(item) + '" class="opportunity-card-v2 ' + (!isOpenItem(item) ? "is-closed" : "") + '" button="true" mode="ios" data-id="' + esc(item.id) + '">' +
        '<ion-card-header>' +
          '<div class="opportunity-card-v2-top">' +
            '<div class="opportunity-card-v2-kind">' +
              '<span class="opportunity-card-v2-icon"><ion-icon name="' + iconName + '" aria-hidden="true"></ion-icon></span>' +
              '<ion-card-subtitle>' + esc(category) + '</ion-card-subtitle>' +
            '</div>' +
            '<span class="opportunity-card-v2-status ' + (isOpenItem(item) && withinWeek(item) ? "danger" : "") + '">' + esc(status) + '</span>' +
          '</div>' +
          '<ion-card-title>' + esc(item.title) + '</ion-card-title>' +
        '</ion-card-header>' +
        '<ion-card-content>' +
          '<p class="opportunity-card-v2-summary">' + esc(item.summary || item.description || "") + '</p>' +
          '<dl class="opportunity-facts"><div><dt>대상</dt><dd>' + esc(item.participation || "공고문 확인") + '</dd></div><div><dt>' + (kind === "support" ? "지원" : "상금") + '</dt><dd>' + esc(item.reward || "공고문 확인") + '</dd></div></dl>' +
          '<div class="opportunity-card-v2-footer">' +
            '<span class="opportunity-card-v2-deadline"><ion-icon name="calendar-clear-outline" aria-hidden="true"></ion-icon>' + esc(deadline) + '</span>' +
            '<ion-icon class="opportunity-card-v2-chevron" name="chevron-forward-outline" aria-hidden="true"></ion-icon>' +
          '</div>' +
        '</ion-card-content>' +
      '</ion-card>';
    }).join("") + '</div>';
  }

  el.querySelectorAll(".category-card, .opportunity-card-v2").forEach(row => {
    row.addEventListener("click", () => {
      const item = state.all.find(x => x.id === row.dataset.id);
      if (!item) return;
      state.lastRoute = location.hash;
      if (row.tagName !== "ION-CARD") location.hash = itemRoute(item);
    });
  });
}

function tagsHtml(tags) {
  return '<div class="category-tags">' + (tags || []).slice(0,4).map(t => '<span class="IssueLabel category-tag">' + esc(t) + '</span>').join("") + '</div>';
}


const DISCOVERY_TYPE_LABELS = {
  site: "사이트",
  directory: "도구 모음",
  github: "GitHub",
  skill: "Skill",
  mcp: "MCP",
  agent: "Agent",
  workflow: "Workflow",
  discussion: "커뮤니티",
  platform: "플랫폼"
};

const DISCOVERY_AWARENESS_LABELS = {
  WELL_KNOWN: "많이 알려짐",
  SPECIALIZED: "일부 커뮤니티 중심",
  EARLY: "초기 단계"
};

const DISCOVERY_TREND_LABELS = {
  HOT: "급부상",
  RISING: "관심 증가",
  STEADY: "꾸준히 언급",
  RESURFACED: "다시 주목"
};

const DISCOVERY_NEWS_LABELS = {
  NEW_RELEASE: "신규 출시",
  NEWLY_DISCOVERED: "신규 등록",
  UPDATED: "최근 업데이트",
  BASELINE: "기존 등록"
};

function discoveryLabel(map, value) {
  const key = String(value || "").toUpperCase();
  return map[key] || String(value || "");
}

function discoveryTypeLabel(value) {
  const key = String(value || "").toLowerCase();
  return DISCOVERY_TYPE_LABELS[key] || String(value || "");
}

function githubRepository(item) {
  for (const link of item.links || []) {
    try {
      const url = new URL(link.url);
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.hostname === 'github.com' && parts.length === 2 && /^[\w.-]+$/.test(parts[0]) && /^[\w.-]+$/.test(parts[1])) return parts.join('/').replace(/\.git$/, '');
    } catch (_) {}
  }
  return null;
}

function discoveryPrimaryGroup(item) {
  const type = String(item.discoveryType || '').toLowerCase();
  const categories = (item.categories || []).map(v => String(v).toLowerCase());
  if (type === 'workflow' || categories.includes('showcase')) return 'workflows';
  if (type === 'directory') return 'collections';
  if (['skill','mcp','agent'].includes(type) || (githubRepository(item) && categories.includes('skill'))) return 'agents';
  return 'sites';
}

function discoveryPurposeLabel(item) {
  return {workflows:'제작 사례', collections:'도구 모음', agents:'Skill · MCP · Agent', sites:'AI 도구'}[discoveryPrimaryGroup(item)];
}

let githubMetricsSnapshot;
async function fetchGithubMetrics(repo) {
  if (!githubMetricsSnapshot) {
    githubMetricsSnapshot = fetch('data/github-metrics.json', {cache:'no-cache',signal:AbortSignal.timeout(8000)})
      .then(response=>{if(!response.ok) throw new Error('Metrics unavailable');return response.json();});
    setTimeout(()=>{githubMetricsSnapshot=undefined;},300000);
  }
  const counts = (await githubMetricsSnapshot).repositories?.[repo];
  if (!counts || !['OK','STALE'].includes(counts.status) || ![counts.stars,counts.forks].every(n=>Number.isSafeInteger(n)&&n>=0) || !Number.isFinite(Date.parse(counts.fetchedAt))) throw new Error('Metrics unavailable');
  return counts;
}

function hydrateGithubMetrics(root) {
  root.querySelectorAll('[data-github-repo]').forEach(async node => {
    try {
      const counts = await fetchGithubMetrics(node.dataset.githubRepo);
      if (!node.isConnected) return;
      const date = new Date(counts.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
      const stale = counts.status==='STALE' || Date.now()-Date.parse(counts.fetchedAt)>36*60*60*1000;
      node.innerHTML = '<span>☆ 별 '+counts.stars.toLocaleString('ko-KR')+'</span><span>⑂ 포크 '+counts.forks.toLocaleString('ko-KR')+'</span><small>'+ (stale?'갱신 지연 · ':'') +esc(date)+' 수집</small>';
    } catch (_) {
      if (node.isConnected) node.textContent = 'GitHub 수치 확인 불가';
    }
  });
}

function discoveryRank(item) {
  const trendScore = { HOT: 50, RISING: 40, RESURFACED: 30, STEADY: 15 };
  const newsScore = { NEW_RELEASE: 35, UPDATED: 30, NEWLY_DISCOVERED: 20, BASELINE: 5 };
  return (trendScore[String(item.trend || "").toUpperCase()] || 0) +
    (newsScore[String(item.newsState || "").toUpperCase()] || 0);
}

function discoverySignalBadges(item) {
  const parts = [
    discoveryPurposeLabel(item),
    discoveryLabel(DISCOVERY_AWARENESS_LABELS, item.awareness),
    discoveryLabel(DISCOVERY_TREND_LABELS, item.trend),
    discoveryLabel(DISCOVERY_NEWS_LABELS, item.newsState)
  ].filter(Boolean);

  return '<div class="discovery-signals">' +
    parts.map((v,i) => '<span class="IssueLabel discovery-signal ' + (i === 2 ? "trend" : i === 3 ? "news" : "") + '">' + esc(v) + '</span>').join("") +
  '</div>';
}

function discoveryRecommendations() {
  const ranked = (state.data.aiDiscovery || []).slice().sort((a,b) => discoveryRank(b)-discoveryRank(a) || latestDateValue(b).localeCompare(latestDateValue(a)));
  const top = [], types = new Set();
  ranked.forEach(item => { const group = discoveryPrimaryGroup(item); if (!types.has(group) && top.length < 3) {top.push(item);types.add(group);} });
  ranked.forEach(item => {if(top.length < 3 && !top.includes(item)) top.push(item);});
  return top;
}

function discoveryRow(item) {
  const tags = item.categories || item.tags || [];
  const recommended = state.discoveryStatus === "recommended";
  const repo = githubRepository(item);
  return '<a class="discovery-row catalog-card' + (recommended ? ' is-recommended' : '') + '" href="' + itemRoute(item) + '" data-id="' + esc(item.id) + '">' +
    '<div class="catalog-type"><ion-icon name="' + esc(homeFeedIcon(item)) + '" aria-hidden="true"></ion-icon><span>' + esc(discoveryPurposeLabel(item)) + '</span>' + (recommended ? '<span class="catalog-recommendation">추천</span>' : '') + (isNewToday(item) ? '<span class="catalog-new">신규</span>' : '') + '</div>' +
    '<h3>' + esc(item.title) + '</h3><p>' + esc(item.summary || "") + '</p>' +
    '<div class="catalog-tags">' + tags.slice(0,2).map(tag=>'<span>'+esc(tag)+'</span>').join('') + (tags.length>2 ? '<span aria-label="추가 태그 '+(tags.length-2)+'개">+'+(tags.length-2)+'</span>' : '') + '</div>' + (repo && !requestedDate() ? '<div class="github-metrics" data-github-repo="'+esc(repo)+'" aria-live="polite">GitHub 수치 불러오는 중</div>' : '') + '<span class="paper-edge" aria-hidden="true"></span></a>';
}

function renderDiscoveryHub() {
  const items = state.data.aiDiscovery || [];
  if (["new","rising","recommended"].includes(state.discoveryFilter)) {state.discoveryStatus=state.discoveryFilter;state.discoveryFilter="all";}
  const chips = (options,axis) => options.map(([key,label]) => '<ion-chip mode="ios" role="button" tabindex="0" aria-pressed="' + ((axis==='status'?state.discoveryStatus:axis==='source'?state.discoverySource:state.discoveryFilter)===key) + '" class="filter-chip ' + (((axis==='status'?state.discoveryStatus:axis==='source'?state.discoverySource:state.discoveryFilter)===key)?'active':'') + '" data-axis="'+axis+'" data-filter="'+key+'"><ion-label>'+label+'</ion-label></ion-chip>').join('');
  $("#discoveryHub").innerHTML = '<header class="discovery-head"><div><h1>AI Discovery</h1><p>용도에 맞는 AI 도구와 오픈소스를 찾아보세요.</p></div><p class="discovery-stats">전체 '+items.length+'개</p></header>' +
    '<section class="discovery-all" id="discoveryCatalog" tabindex="-1"><div class="catalog-toolbar" id="discoveryFilters">' +
    '<div class="filter-line"><span class="filter-label">상태</span><div class="filter-row">'+chips([["all","전체"],["recommended","추천"],["new","신규 등록"],["rising","주목받는 도구"]],'status')+'</div></div>'+
    '<div class="filter-line"><span class="filter-label">용도</span><div class="filter-row">'+chips([["all","전체"],["tools","AI 도구"],["collections","도구 모음"],["agents","Skill · MCP · Agent"],["workflow","제작 사례"]],'type')+'</div></div>'+
    '<div class="filter-line"><span class="filter-label">출처</span><div class="filter-row">'+chips([["all","전체"],["github","GitHub"]],'source')+'</div></div></div>'+
    '<div class="catalog-results"><p id="discoveryResultCount" role="status" aria-live="polite"></p><button id="resetDiscoveryFilters" type="button">필터 초기화</button></div><p class="recommendation-note" id="recommendationNote" hidden>최근 업데이트와 관심도를 바탕으로 서로 다른 분야의 도구를 골랐습니다.</p>'+
    '<div class="discovery-all-list catalog-grid" id="discoveryAllList"></div></section>';
  $("#discoveryFilters").querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.axis==='status') state.discoveryStatus=button.dataset.filter; else if(button.dataset.axis==='source') state.discoverySource=button.dataset.filter; else state.discoveryFilter=button.dataset.filter;
    $("#discoveryFilters").querySelectorAll('[data-filter]').forEach(chip=>{const selected=(chip.dataset.axis==='status'?state.discoveryStatus:chip.dataset.axis==='source'?state.discoverySource:state.discoveryFilter)===chip.dataset.filter;chip.classList.toggle('active',selected);chip.setAttribute('aria-pressed',String(selected));});
    renderDiscoveryAllList();
  }));
  $("#resetDiscoveryFilters").addEventListener('click',()=>{state.discoveryFilter='all';state.discoveryStatus='all';state.discoverySource='all';renderDiscoveryHub();$('#discoveryFilters [data-axis=status][data-filter=all]').focus();});
  renderDiscoveryAllList();
}

function matchesDiscoveryFilter(item, filter) {
  if (filter === "all") return true;
  if (filter === "new") return isNewToday(item);
  if (filter === "rising") return ["HOT","RISING","RESURFACED"].includes(String(item.trend || "").toUpperCase());
  if (filter === "tools") return discoveryPrimaryGroup(item) === "sites";
  if (filter === "collections") return discoveryPrimaryGroup(item) === "collections";
  if (filter === "github") return !!githubRepository(item);
  if (filter === "agents") return discoveryPrimaryGroup(item) === "agents";
  if (filter === "workflow") return discoveryPrimaryGroup(item) === "workflows";
  return String(item.discoveryType || "").toLowerCase() === filter;
}

function renderDiscoveryAllList() {
  const el = $("#discoveryAllList");
  if (!el) return;

  const items = (state.data.aiDiscovery || [])
    .filter(item => matchesDiscoveryFilter(item, state.discoverySource) && matchesDiscoveryFilter(item, state.discoveryFilter) && (state.discoveryStatus === "recommended" ? discoveryRecommendations().some(pick=>pick.id===item.id) : matchesDiscoveryFilter(item, state.discoveryStatus)))
    .sort((a,b) => {
      const score = discoveryRank(b) - discoveryRank(a);
      if (score) return score;
      return String(b.firstSeenDate || "").localeCompare(String(a.firstSeenDate || ""));
    });

  $("#discoveryResultCount").textContent = "도구 " + items.length + "개";
  $("#recommendationNote").hidden = state.discoveryStatus !== "recommended";
  $("#resetDiscoveryFilters").disabled = state.discoveryFilter === "all" && state.discoveryStatus === "all" && state.discoverySource === "all";
  el.innerHTML = items.length
    ? items.map(discoveryRow).join("")
    : '<div class="empty-state">선택한 조건에 맞는 도구가 없습니다.</div>';

  hydrateGithubMetrics(el);
  el.querySelectorAll(".discovery-row").forEach(card => {
    card.addEventListener("click", () => {
      state.lastRoute = "#/ai-discovery";
      // Native anchor preserves modifier clicks and keyboard navigation.
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
    return '<ion-item class="archive-card" button="true" detail="true" lines="inset" mode="ios" data-date="' + d + '"><div><small>' + dt.getFullYear() + '년 ' + (dt.getMonth()+1) + '월</small><strong>' + dt.getDate() + '일 ' + w + '요일</strong><span>이날의 브리핑 보기</span></div></ion-item>';
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
  const parentRoutes = {ai: ["#/ai-news", "AI 뉴스"], discovery: ["#/ai-discovery", "Discovery"], contest: ["#/contests", "공모전 · 해커톤"], support: ["#/support", "창업 · 지원사업"]};
  const [parentRoute, parentLabel] = parentRoutes[kind];
  $("#detailBreadcrumb").innerHTML = '<a href="#/">홈</a><ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon><a href="' + parentRoute + '">' + parentLabel + '</a><ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon><span>상세 정보</span>';
  $("#backButton").setAttribute("href", parentRoute);
  $("#backButton").innerHTML = '<ion-icon slot="start" name="arrow-back-outline" aria-hidden="true"></ion-icon>목록으로';
  const detailView = $("#detailView");
  detailView.classList.remove("tone-ai","tone-resource","tone-opensource","tone-contest","tone-support");
  detailView.classList.add("tone-" + homeSignalTone(item));
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
      '<span class="IssueLabel detail-pill">' + esc(!isOpenItem(item) ? "종료" : String(item.status).toUpperCase() === "UPCOMING" ? "접수 예정" : (item.dDay || "접수 중")) + '</span>' +
      '<span class="IssueLabel detail-pill">' + category + '</span>' +
    '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.description || item.summary || "") + '</p>' +
    '<div class="detail-date-line"><span><b>등록일</b> ' + esc(item.firstSeenDate) + '</span><span><b>확인일</b> ' + esc(item.lastVerifiedDate || item.firstSeenDate) + '</span>' +
    (item.lastUpdatedDate ? '<span><b>수정일</b> ' + esc(item.lastUpdatedDate) + '</span>' : '') + '</div>';

  const decisionFacts = [["마감", item.deadlineText || item.dDay], ["대상", item.participation], [kind === "support" ? "지원 내용" : "상금", item.reward]].filter(([,value]) => value);
  $("#detailHeader").insertAdjacentHTML("beforeend", '<dl class="decision-facts">' + decisionFacts.map(([label,value]) => '<div><dt>' + label + '</dt><dd>' + esc(value) + '</dd></div>').join("") + '</dl>');

  $("#detailTopActions").innerHTML = links.slice(0,2).map((l,i) =>
    '<div class="source-action"><span class="source-name">' + esc(l.label) + '</span><ion-button mode="ios" size="small" class="' + (i === 0 ? "primary-link" : "secondary-link") + '" fill="' + (i === 0 ? "solid" : "clear") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + (i === 0 ? '원문 보기' : '관련 자료') + '<ion-icon slot="end" name="open-outline"></ion-icon></ion-button></div>'
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
    infoBlock("접수 일정","",[["접수 / 일정", item.period]].filter(([,value]) => value)) +
    infoBlock("신청 자격","",eligible) +
    infoBlock("진행 방식","",process) +
    (ideas.length ? ideaBlock(kind === "support" ? "활용 아이디어" : "개발 아이디어", ideas) : "") +
    (links.length ? '<section class="detail-block"><h2>공식 링크</h2><div class="official-link-list">' + links.map(l => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><span>' + esc(l.label) + '</span><span>↗</span></a>').join("") + '</div></section>' : '');

  $("#detailAside").innerHTML = "";
}

function renderDiscoveryDetail(item) {
  const links = item.links || [];
  const related = item.related || [];
  $("#detailHeader").innerHTML =
    '<div class="detail-kicker">' + changeBadge(item, "discovery") +
      '<span class="IssueLabel detail-pill">' + esc(discoveryPurposeLabel(item)) + '</span>' +
      (item.awareness ? '<span class="IssueLabel detail-pill">' + esc(discoveryLabel(DISCOVERY_AWARENESS_LABELS, item.awareness)) + '</span>' : '') +
      (item.trend ? '<span class="IssueLabel detail-pill">' + esc(discoveryLabel(DISCOVERY_TREND_LABELS, item.trend)) + '</span>' : '') +
      (item.newsState ? '<span class="IssueLabel detail-pill">' + esc(discoveryLabel(DISCOVERY_NEWS_LABELS, item.newsState)) + '</span>' : '') +
    '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.summary || "") + '</p>' +
    '<div class="detail-date-line"><span><b>등록일</b> ' + esc(item.firstSeenDate) + '</span><span><b>확인일</b> ' + esc(item.lastUpdatedDate || item.firstSeenDate) + '</span></div>';

  $("#detailTopActions").innerHTML = links.slice(0,2).map((l,i) =>
    '<div class="source-action"><span class="source-name">' + esc(l.label) + '</span><ion-button mode="ios" size="small" class="' + (i === 0 ? "primary-link" : "secondary-link") + '" fill="' + (i === 0 ? "solid" : "clear") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + (i === 0 ? '원문 보기' : '관련 자료') + '<ion-icon slot="end" name="open-outline"></ion-icon></ion-button></div>'
  ).join("");

  $("#detailContent").innerHTML =
    infoBlock("서비스 소개","",[["설명", item.description || item.summary],["주요 특징", item.why],["등록 경위", item.discoveryReason]]) +
    infoBlock("이용 현황","",[
      ["알려진 정도", discoveryLabel(DISCOVERY_AWARENESS_LABELS, item.awareness)],
      ["관심도", discoveryLabel(DISCOVERY_TREND_LABELS, item.trend)],
      ["최근 변화", discoveryLabel(DISCOVERY_NEWS_LABELS, item.newsState)]
    ]) +
    infoBlock("관련 정보","",[["출처", (item.signals || []).join(" · ")],["분류", (item.categories || []).join(" · ")]]) +
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
      '<span class="IssueLabel detail-pill">AI 뉴스</span>' +
    '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.summary || "") + '</p>' +
    '<div class="detail-date-line"><span><b>등록일</b> ' + esc(item.firstSeenDate) + '</span><span><b>수정일</b> ' + esc(item.lastUpdatedDate || item.firstSeenDate) + '</span></div>';

  $("#detailTopActions").innerHTML = links.slice(0,2).map((l,i) =>
    '<div class="source-action"><span class="source-name">' + esc(l.label) + '</span><ion-button mode="ios" size="small" class="' + (i === 0 ? "primary-link" : "secondary-link") + '" fill="' + (i === 0 ? "solid" : "clear") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + (i === 0 ? '원문 보기' : '관련 자료') + '<ion-icon slot="end" name="open-outline"></ion-icon></ion-button></div>'
  ).join("");

  $("#detailContent").innerHTML =
    updateTimeline(item.updates || []) +
    infoBlock("핵심 내용","",[["내용",item.description || item.summary]]) +
    infoBlock("핵심 변화","",[["의미",item.why || item.description || item.summary]]) +
    (ideas.length ? ideaBlock("활용 방법",ideas) : "") +
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
  $(".skip-link")?.addEventListener("click", event => {
    event.preventDefault();
    const main = $("#mainContent");
    main.focus({preventScroll: true});
    main.scrollIntoView({block: "start"});
  });
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  window.addEventListener("hashchange", () => {
    saveViewState(state.activeRoute);
    route();
  });

  window.addEventListener("pagehide", () => saveViewState(state.activeRoute));

  const mobileMenu = $("#mobileMenu");
  if (mobileMenu) mobileMenu.addEventListener("click", () => document.body.classList.toggle("menu-open"));
  document.querySelectorAll(".nav-item").forEach(a => a.addEventListener("click", () => document.body.classList.remove("menu-open")));

  document.querySelectorAll("[data-discovery-filter]").forEach(link => {
    link.addEventListener("click", () => {
      state.discoveryFilter = link.dataset.discoveryFilter || "all";
      state.discoveryStatus = "all";
      state.discoverySource = "all";
    });
  });

  $("#resetCategoryFilters").addEventListener("click", () => {
    const type = location.hash.slice(2);
    state.categoryFilter = type === "ai-news" ? "all" : "open";
    state.categoryTopicFilter = "all";
    renderFilterChips(type);
    renderTopicChips(type);
    renderCategoryList(type);
    $("#categoryFilters ion-chip")?.focus({preventScroll: true});
  });

  document.addEventListener("click", event => {
    const sectionLink = event.target.closest?.("[data-scroll-target]");
    if (!sectionLink) return;
    const target = document.getElementById(sectionLink.dataset.scrollTarget);
    target?.scrollIntoView({block: "start"});
    target?.focus({preventScroll: true});
  });

  $("#categorySort").addEventListener("ionChange", e => {
    state.categorySort = e.detail.value;
    const routeName = location.hash.replace("#/","");
    renderCategoryList(routeName);
  });

  const dialog = $("#searchDialog");
  const input = $("#searchInput");

  const openSearch = () => {
    dialog.showModal();
    setTimeout(() => input.setFocus?.(),30);
  };
  const closeSearch = () => { if (dialog.open) dialog.close(); };

  $("#searchButton").addEventListener("click", openSearch);
  $("#searchClose").addEventListener("click", closeSearch);

  document.addEventListener("keydown", e => {
    const chip = e.target.closest?.('ion-chip[role="button"]');
    if (chip && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      chip.click();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearch();
    } else if (e.key === "Escape") {
      closeSearch();
    }
  });

  input.addEventListener("ionInput", e => {
    const q = String(e.detail.value || "").trim().toLowerCase();
    const results = !q ? [] : state.all.filter(x =>
      [x.title,x.summary,x.description,x.why,x.discoveryReason]
        .concat(x.tags || [])
        .concat(x.categories || [])
        .concat(x.signals || [])
        .concat(x.related || [])
        .concat((x.links || []).map(link => link.label || ""))
        .concat((x.updates || []).map(u => [u.label,u.text].join(" ")))
        .join(" ").toLowerCase().includes(q)
    ).slice(0,12);

    $("#searchResults").innerHTML = results.length
      ? results.map(x => '<a class="search-result" href="' + itemRoute(x) + '" data-id="' + esc(x.id) + '"><b>' + esc(x.title) + '</b><span>' + esc(x.summary || "") + '</span></a>').join("")
      : (q ? '<div class="empty-state"><strong>검색 결과가 없습니다</strong><p>검색어를 줄이거나 다른 단어로 검색해 주세요.</p></div>' : '<div class="search-guidance"><ion-icon name="search-outline" aria-hidden="true"></ion-icon><strong>찾으시는 정보를 검색하세요</strong><p>AI 뉴스, 개발 도구, 공모전, 지원사업을 검색할 수 있습니다.</p></div>');

    $("#searchResults").querySelectorAll(".search-result").forEach(row => {
      row.addEventListener("click", event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const item = state.all.find(x => x.id === row.dataset.id);
        closeSearch();
        state.lastRoute = location.hash || "#/";
        location.hash = itemRoute(item);
      });
    });
  });
}

function bootstrap() {
  setupInteractions();
  loadData().catch(err => {
    console.error(err);
    document.querySelector("main").innerHTML = '<div class="empty-state">브리핑 데이터를 불러오지 못했습니다.</div>';
  });
}

bootstrap();
