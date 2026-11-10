const state = {
  data: null,
  all: [],
  lastRoute: "#/",
  categoryFilter: "all",
  categoryTopicFilter: "all",
  categorySort: "deadline",
  activeRoute: null,
  viewStates: {}
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

  if (route === "#/contests" || route === "#/support") {
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

// D-day is counted from the structured deadline on the viewer's day, so a missed publish
// cannot freeze it (docs/archive/review-2026-11-06-dday.md). Older snapshots only carry dDay text.
function referenceDate() {
  if (requestedDate() || !state.data) return state.data ? state.data.date : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return today > state.data.date ? today : state.data.date;
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

function nextDeadline(item) {
  const ref = referenceDate();
  return item.deadline.filter(d => !ref || d >= ref).sort()[0] || null;
}

function ddayNumber(item) {
  if (!item) return null;
  if (Array.isArray(item.deadline)) {
    const next = nextDeadline(item);
    return next ? daysBetween(referenceDate(), next) : null;
  }
  if (!item.dDay) return null;
  const v = String(item.dDay);
  if (v.includes("오늘") || /D-?DAY/i.test(v)) return 0;
  const m = v.match(/D-(\d+)/i);
  return m ? Number(m[1]) : null;
}

function ddayText(item) {
  if (!item) return "";
  if (Array.isArray(item.deadline)) {
    const n = ddayNumber(item);
    return n === null ? "마감" : n === 0 ? "오늘 마감" : "D-" + n;
  }
  return item.dDay;
}

// Published from portal data before the organizer's page was read (user decision 2026-11-09).
function pendingOfficialLabel(item, cls) {
  return item.officialCheck === "PENDING"
    ? '<span class="' + (cls || "opportunity-card-v2-status") + '">주최 측 확인 전</span>'
    : "";
}

function deadlinePassed(item) {
  return Array.isArray(item.deadline) && item.deadline.length > 0 && !nextDeadline(item);
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
    const suffix = item.deadlineText ? " · " + item.deadlineText : ddayText(item) ? " · " + ddayText(item) : "";
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
  return String(item.status || "OPEN").toUpperCase() !== "CLOSED" && !deadlinePassed(item);
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

function updatedFirst(items) {
  return items.slice().sort((a,b) => {
    const pa = isNewToday(a) ? 0 : isUpdatedToday(a) ? 1 : 2;
    const pb = isNewToday(b) ? 0 : isUpdatedToday(b) ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return latestDateValue(b).localeCompare(latestDateValue(a));
  });
}

function changeBadge(item) {
  return isNewToday(item) ? '<span class="IssueLabel change-badge new">신규 등록</span>' : "";
}

function dateMetaHtml(item) {
  const first = shortDate(item.firstSeenDate);
  const second = shortDate(item.lastVerifiedDate || item.firstSeenDate);
  const secondLabel = "확인일";

  return '<div class="card-date-meta">' +
    (first ? '<span><b>등록일</b> ' + esc(first) + '</span>' : '') +
    (second ? '<span><b>' + secondLabel + '</b> ' + esc(second) + '</span>' : '') +
  '</div>';
}

function dangerClass(item) { return isToday(item) ? "danger" : ""; }

function itemKind(item) {
  if ((state.data.support || []).some(x => x.id === item.id)) return "support";
  return "contest";
}

function itemRoute(item) {
  const kind = itemKind(item);
  return "#/" + kind + "/" + encodeURIComponent(item.id);
}

async function loadData() {
  const date = requestedDate();
  const path = date ? "data/archive/" + date + ".json" : "data/latest.json";
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) throw new Error("브리핑 데이터를 불러오지 못했습니다.");

  state.data = await res.json();
  // An open call whose deadline is not stated stays off the site until it is confirmed (user decision 2026-11-09).
  const listed = item => !(item.deadline === "확인 필요" && String(item.status || "OPEN").toUpperCase() === "OPEN");
  state.data.contests = (state.data.contests || []).filter(listed);
  state.data.support = (state.data.support || []).filter(listed);
  state.all = [].concat(state.data.contests, state.data.support);
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
  const supportCount = (data.support || []).filter(isOpenItem).length;
  set("#navContestCount", contestCount);
  set("#navSupportCount", supportCount);
  set("#topNavContestCount", contestCount);
  set("#topNavSupportCount", supportCount);
  renderGlobalShellData();
}

function renderGlobalShellData() {
  renderHomeTrending();
  renderHomeRightUpcoming();
  renderHomeLeftArchive();
}

function hideAllViews() {
  ["#homeView","#categoryView","#archiveView","#detailView"].forEach(id => $(id).hidden = true);
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

  if (hash === "#/support") {
    setActiveNav("support");
    $("#categoryView").hidden = false;
    renderCategory("support");
    document.title = "창업 · 지원사업 | daily-brief";
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

  const m = hash.match(/^#\/(contest|support)\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[2]);
    const item = state.all.find(x => x.id === id);
    if (item) {
      setActiveNav(m[1] === "support" ? "support" : "contests");
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
  const support = state.data.support || [];
  const totalNewToday = contests.filter(isNewToday).length + support.filter(isNewToday).length;

  const set = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
  set("#homeDateLabel", state.data.date);
  set("#homeTotalCount", state.all.length);
  set("#homeNewTotal", totalNewToday);

  renderHomeFeed();
}

function homeSignalScore(item) {
  if (!isOpenItem(item)) return 5;
  const d = ddayNumber(item);
  const urgency = d === null ? 8 : Math.max(0, 46 - Math.min(d, 46));
  return 42 + urgency + (isNewToday(item) ? 18 : 0);
}

function homeSignalLabel(item) {
  return itemKind(item) === "support" ? "창업 · 지원사업" : "공모전 · 해커톤";
}

function homeSignalTone(item) {
  return itemKind(item) === "support" ? "support" : "contest";
}

function homeSignalStatus(item) {
  return !isOpenItem(item) ? "종료" : (ddayText(item) || "진행 중");
}

function homeSignalMeta(item) {
  return item.deadlineText || ddayText(item) || item.categoryLabel || "";
}

function homeFeedIcon(item) {
  return itemKind(item) === "support" ? "briefcase-outline" : "trophy-outline";
}

function homeFeedTags(item) {
  return (item.tags || []).slice(0,3).join(" · ") || homeSignalLabel(item);
}

function homeBriefingSections() {
  const available = state.all.filter(isOpenItem);
  const urgent = available.filter(withinWeek).sort((a,b)=>ddayNumber(a)-ddayNumber(b));
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
        '<div class="product-side"><strong class="' + (isOpenItem(item) && withinWeek(item) ? 'deadline-urgent' : '') + '">' + esc(homeSignalStatus(item)) + '</strong><span>' + esc(cut(homeSignalMeta(item), 44)) + '</span></div>' +
      '</div>' +
    '</ion-item>';
}

function renderHomeFeed() {
  const el = $('#homeFeed');
  if (!el) return;
  el.innerHTML = homeBriefingSections().map(section => '<section class="briefing-section" data-briefing-section="'+section.id+'" aria-labelledby="briefing-'+section.id+'">'+
    '<header class="briefing-section-head"><div><h2 id="briefing-'+section.id+'">'+section.title+'</h2><p>'+section.description+'</p></div><span>'+section.items.length+'개'+(section.items.length>5?' 중 5개':'')+'</span></header>'+
    (section.items.length ? section.items.slice(0,5).map(homeBriefingRow).join('') : '<p class="briefing-empty">'+section.empty+'</p>')+'</section>').join('')+
    '<nav class="briefing-browse" aria-label="전체 자료 탐색"><span>전체 자료 보기</span><a href="#/contests">공모전 · 해커톤</a><a href="#/support">창업 · 지원사업</a></nav>';
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
    '<a class="right-row" href="' + itemRoute(item) + '"><strong>' + esc(ddayText(item) || "진행 중") + '</strong><span>' + esc(item.title) + '</span></a>'
  ).join("") || '<div class="right-empty">확인된 마감이 없습니다.</div>';
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

function renderHomeTrending() {
  const scores = new Map();
  const add = (label, weight = 1) => {
    const key = String(label || "").trim();
    if (!key || /^(ai|site|showcase|resource)$/i.test(key)) return;
    scores.set(key, (scores.get(key) || 0) + weight);
  };

  [].concat(state.data.contests || [], state.data.support || []).filter(isOpenItem)
    .forEach(item => (item.tags || []).forEach(tag => add(tag, isNewToday(item) ? 2 : 1)));

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
    '<a class="upcoming-row" href="' + itemRoute(item) + '" data-id="' + esc(item.id) + '"><span class="upcoming-date">' + esc(ddayText(item) || "진행 중") + '</span><strong>' + esc(item.title) + '</strong><span class="upcoming-kind">' + (itemKind(item) === "support" ? "지원사업" : "공모전") + '</span><span class="signal-arrow">↗</span></a>'
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
        (ddayText(item) ? '<span class="featured-badge ' + dangerClass(item) + '">' + esc(ddayText(item)) + '</span>' : '') +
        '<span class="featured-meta">' + category + '</span>' +
      '</div>' +
      '<h3 class="featured-title">' + esc(item.title) + '</h3>' +
      '<p class="featured-summary">' + esc(item.summary || "") + '</p>' +
      '<div class="featured-facts">' +
        '<div class="flow-fact"><span>마감</span><strong>' + esc(txt(item.deadlineText || ddayText(item))) + '</strong></div>' +
        '<div class="flow-fact"><span>' + (kind === "support" ? "지원 / 혜택" : "상금 / 보상") + '</span><strong>' + esc(cut(item.reward || item.aiSupport, 90)) + '</strong></div>' +
        '<div class="flow-fact"><span>' + (kind === "support" ? "지원 대상" : "참가") + '</span><strong>' + esc(cut(item.participation, 90)) + '</strong></div>' +
      '</div>' +
      '<span class="featured-cta">상세 보기 →</span>' +
    '</div>';

  el.onclick = () => location.hash = itemRoute(item);
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
  const routeKey = type === "contests" ? "#/contests" : "#/support";
  const savedView = state.viewStates[routeKey] || {};

  state.categoryFilter = savedView.categoryFilter || "open";
  state.categoryTopicFilter = savedView.categoryTopicFilter || "all";
  state.categorySort = savedView.categorySort || "deadline";

  const configs = {
    contests: {
      eyebrow:"접수 일정 · 참가 자격",
      title:"공모전 · 해커톤",
      description:"공모전과 해커톤의 접수 일정, 참가 자격, 상금을 확인하세요."
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
  sort.innerHTML = '<ion-select-option value="deadline">마감일순</ion-select-option><ion-select-option value="discovered">등록일순</ion-select-option><ion-select-option value="updated">최근 수정순</ion-select-option>';
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
  "startup-product": "스타트업 · 프로덕트",
  "idea": "아이디어"
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
  // Idea contests had no topic and fell through to software (2026-11-10).
  const devWords = /개발|소프트웨어|코딩|프로그래밍|해커톤|hackathon|알고리즘/;
  if (devWords.test(explicit.replace("공모전 · 해커톤", "") + " " + String(item.title || "").toLowerCase())) return "software";
  return "idea";
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
  return state.data.support || [];
}

function matchesFilter(item, type, filter) {
  if (filter === "all") return true;

  const hay = [item.title,item.summary,item.description,item.participation,item.preStartup,item.aiSupport]
    .concat(item.tags || [])
    .concat((item.updates || []).map(u => [u.label,u.text].join(" ")))
    .join(" ").toLowerCase();

  if (filter === "open") return isOpenItem(item);
  if (filter === "closed") return !isOpenItem(item);
  if (filter === "new") return isNewToday(item);
  if (filter === "urgent") return isOpenItem(item) && withinWeek(item);
  if (filter === "individual") return /개인|1인|혼자/.test(hay);
  if (filter === "prestart") return /예비창업/.test(hay) && !/대상 아님/.test(hay);
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
    items = updatedFirst(items);
  } else if (state.categorySort === "discovered") {
    items = items.slice().sort((a,b) => String(b.firstSeenDate || "").localeCompare(String(a.firstSeenDate || "")));
  }

  const newCount = source.filter(isNewToday).length;
  const openCount = source.filter(isOpenItem).length;
  $("#categoryCount").textContent = "모집 중·예정 " + openCount + " · 신규 등록 " + newCount + " · 전체 " + source.length;
  $("#categoryResultCount").innerHTML = '공고 <strong>' + items.length + '</strong>건';
  $("#resetCategoryFilters").disabled = state.categoryFilter === "open" && state.categoryTopicFilter === "all";
  const el = $("#categoryList");
  if (!items.length) {
    el.innerHTML = '<div class="empty-state"><ion-icon name="filter-outline" aria-hidden="true"></ion-icon><strong>조건에 맞는 결과가 없습니다</strong><p>필터를 초기화하거나 다른 조건을 선택해 주세요.</p></div>';
    return;
  }

  {
    const kind = type === "support" ? "support" : "contest";
    const iconName = kind === "support" ? "briefcase-outline" : "trophy-outline";

    el.innerHTML = '<div class="opportunity-grid-inner">' + items.map(item => {
      const status = !isOpenItem(item) ? "종료" : String(item.status).toUpperCase() === "UPCOMING" ? "접수 예정" : (ddayText(item) || "접수 중");
      const category = kind === "support" ? "창업 · 지원사업" : contestTopicLabel(item);
      const tags = (item.tags || []).slice(0, 3);
      const deadline = item.deadlineText || ddayText(item) || "일정 확인";

      return '<ion-card href="' + itemRoute(item) + '" class="opportunity-card-v2 ' + (!isOpenItem(item) ? "is-closed" : "") + '" button="true" mode="ios" data-id="' + esc(item.id) + '">' +
        '<ion-card-header>' +
          '<div class="opportunity-card-v2-top">' +
            '<div class="opportunity-card-v2-kind">' +
              '<span class="opportunity-card-v2-icon"><ion-icon name="' + iconName + '" aria-hidden="true"></ion-icon></span>' +
              '<ion-card-subtitle>' + esc(category) + '</ion-card-subtitle>' +
            '</div>' +
            '<span class="opportunity-card-v2-status ' + (isOpenItem(item) && withinWeek(item) ? "danger" : "") + '">' + esc(status) + '</span>' +
            pendingOfficialLabel(item) +
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
  const parentRoutes = {contest: ["#/contests", "공모전 · 해커톤"], support: ["#/support", "창업 · 지원사업"]};
  const [parentRoute, parentLabel] = parentRoutes[kind];
  $("#detailBreadcrumb").innerHTML = '<a href="#/">홈</a><ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon><a href="' + parentRoute + '">' + parentLabel + '</a><ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon><span>상세 정보</span>';
  $("#backButton").setAttribute("href", parentRoute);
  $("#backButton").innerHTML = '<ion-icon slot="start" name="arrow-back-outline" aria-hidden="true"></ion-icon>목록으로';
  const detailView = $("#detailView");
  detailView.classList.remove("tone-contest","tone-support");
  detailView.classList.add("tone-" + homeSignalTone(item));
  renderOpportunityDetail(item, kind);
}

function renderOpportunityDetail(item, kind) {
  const category = kind === "support" ? "창업 · 지원사업" : contestTopicLabel(item);
  const links = item.links || [];
  const ideas = item.ideas || [];

  $("#detailHeader").innerHTML =
    '<div class="detail-kicker">' +
      changeBadge(item, kind) +
      '<span class="IssueLabel detail-pill">' + esc(!isOpenItem(item) ? "종료" : String(item.status).toUpperCase() === "UPCOMING" ? "접수 예정" : (ddayText(item) || "접수 중")) + '</span>' +
      '<span class="IssueLabel detail-pill">' + category + '</span>' +
      pendingOfficialLabel(item, "IssueLabel detail-pill") +
    '</div><h1>' + esc(item.title) + '</h1><p>' + esc(item.description || item.summary || "") + '</p>' +
    '<div class="detail-date-line"><span><b>등록일</b> ' + esc(item.firstSeenDate) + '</span><span><b>확인일</b> ' + esc(item.lastVerifiedDate || item.firstSeenDate) + '</span>' +
    (item.lastUpdatedDate ? '<span><b>수정일</b> ' + esc(item.lastUpdatedDate) + '</span>' : '') + '</div>';

  const decisionFacts = [["마감", item.deadlineText || ddayText(item)], ["대상", item.participation], [kind === "support" ? "지원 내용" : "상금", item.reward]].filter(([,value]) => value);
  $("#detailHeader").insertAdjacentHTML("beforeend", '<dl class="decision-facts">' + decisionFacts.map(([label,value]) => '<div><dt>' + label + '</dt><dd>' + esc(value) + '</dd></div>').join("") + '</dl>');

  $("#detailTopActions").innerHTML = links.slice(0,2).map((l,i) =>
    '<div class="source-action"><span class="source-name">' + esc(l.label) + '</span><ion-button mode="ios" size="small" class="' + (i === 0 ? "primary-link" : "secondary-link") + '" fill="' + (i === 0 ? "solid" : "clear") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + (i === 0 ? '원문 보기' : '관련 자료') + '<ion-icon slot="end" name="open-outline"></ion-icon></ion-button></div>'
  ).join("");

  const core = [
    ["마감", item.deadlineText || ddayText(item)],
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
  const fallback = state.lastRoute || "#/";
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

  $("#resetCategoryFilters").addEventListener("click", () => {
    const type = location.hash.slice(2);
    state.categoryFilter = "open";
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
      [x.title,x.summary,x.description]
        .concat(x.tags || [])
        .concat((x.links || []).map(link => link.label || ""))
        .concat((x.updates || []).map(u => [u.label,u.text].join(" ")))
        .join(" ").toLowerCase().includes(q)
    ).slice(0,12);

    $("#searchResults").innerHTML = results.length
      ? results.map(x => '<a class="search-result" href="' + itemRoute(x) + '" data-id="' + esc(x.id) + '"><b>' + esc(x.title) + '</b><span>' + esc(x.summary || "") + '</span></a>').join("")
      : (q ? '<div class="empty-state"><strong>검색 결과가 없습니다</strong><p>검색어를 줄이거나 다른 단어로 검색해 주세요.</p></div>' : '<div class="search-guidance"><ion-icon name="search-outline" aria-hidden="true"></ion-icon><strong>찾으시는 정보를 검색하세요</strong><p>공모전, 해커톤, 창업·지원사업을 검색할 수 있습니다.</p></div>');

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
