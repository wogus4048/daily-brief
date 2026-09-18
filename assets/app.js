
const state = { data: null, all: [] };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const cut = (s, n) => {
  const v = String(s == null ? "" : s);
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
};

function requestedDate() {
  const value = new URLSearchParams(location.search).get("date");
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : null;
}

function ddayNumber(item) {
  if (!item || !item.dDay) return null;
  const text = String(item.dDay);
  if (text.includes("오늘")) return 0;
  const m = text.match(/D-(\d+)/i);
  return m ? Number(m[1]) : null;
}

function isTodayDeadline(item) {
  return ddayNumber(item) === 0;
}

function isWithinWeek(item) {
  const n = ddayNumber(item);
  return n !== null && n >= 0 && n <= 7;
}

function urgencyClass(item) {
  const n = ddayNumber(item);
  if (n === 0) return "today";
  if (n !== null && n <= 3) return "urgent";
  if (n !== null && n <= 7) return "soon";
  return "normal";
}

async function loadData() {
  const date = requestedDate();
  const path = date ? "data/archive/" + date + ".json" : "data/latest.json";
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) {
    if (date) {
      history.replaceState({}, "", location.pathname);
      return loadData();
    }
    throw new Error("브리핑 데이터를 불러오지 못했습니다.");
  }
  const data = await res.json();
  state.data = data;
  state.all = [].concat(data.contests || [], data.aiNews || [], data.support || []);
  render(data);
}

function formatLongDate(s) {
  const d = new Date(s + "T00:00:00+09:00");
  const w = ["일","월","화","수","목","금","토"][d.getDay()];
  return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + w + ")";
}

function render(data) {
  document.title = data.date + " | daily-brief";
  $("#todayChip").textContent = formatLongDate(data.date);
  $("#dateLine").textContent = formatLongDate(data.date);
  $("#year").textContent = new Date().getFullYear();

  const contests = data.contests || [];
  const aiNews = data.aiNews || [];
  const support = data.support || [];

  $("#todayDeadlineCount").textContent = contests.filter(isTodayDeadline).length + support.filter(isTodayDeadline).length;
  $("#weekDeadlineCount").textContent = contests.filter(isWithinWeek).length + support.filter(isWithinWeek).length;
  $("#contestCount").textContent = contests.length;
  $("#supportCount").textContent = support.length;
  $("#contestCountLabel").textContent = contests.length + "건";
  $("#supportCountLabel").textContent = support.length + "건";
  $("#aiCountLabel").textContent = aiNews.length + "건";

  renderSpotlight(contests, support);
  renderOpportunityList("#contestList", contests, "contest");
  renderOpportunityList("#supportList", support, "support");
  renderNewsList("#aiList", aiNews);
  renderArchive(data.archive || []);
}

function renderSpotlight(contests, support) {
  const el = $("#heroSpotlight");
  const pool = [].concat(contests, support);
  if (!pool.length) {
    el.innerHTML = '<span class="spotlight-label">오늘 먼저 볼 것</span><strong>새로 확인할 핵심 정보가 없습니다.</strong><p>새로운 정보가 확인되면 여기에 가장 먼저 표시됩니다.</p>';
    return;
  }

  pool.sort((a, b) => {
    const da = ddayNumber(a);
    const db = ddayNumber(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  const item = pool[0];
  let meta = "";
  if (item.dDay) meta += "<span>" + esc(item.dDay) + "</span>";
  if (item.reward) meta += "<span>" + esc(cut(item.reward, 28)) + "</span>";
  if (item.participation) meta += "<span>" + esc(cut(item.participation, 24)) + "</span>";

  el.innerHTML =
    '<span class="spotlight-label">오늘 먼저 볼 것</span>' +
    "<strong>" + esc(item.title) + "</strong>" +
    "<p>" + esc(item.summary || "") + "</p>" +
    '<div class="spotlight-meta">' + meta + "</div>";
  el.onclick = () => openDetail(item.id);
}

function renderOpportunityList(sel, items, type) {
  const el = $(sel);
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">현재 표시할 ' + (type === "support" ? "지원사업" : "공모전·해커톤") + '이 없습니다.<br>새로운 정보가 확인되면 자동으로 추가됩니다.</div>';
    return;
  }

  el.innerHTML = items.map((item) => {
    const urgency = urgencyClass(item);
    const status = item.dDay ? '<span class="status-badge status-' + urgency + '">' + esc(item.dDay) + '</span>' : "";
    const category = '<span class="soft-badge category-badge category-' + type + '">' + esc(item.categoryLabel || (type === "support" ? "지원사업" : "공모전·해커톤")) + "</span>";
    const deadline = item.deadlineText ? '<span class="soft-badge deadline-badge">마감 ' + esc(item.deadlineText) + "</span>" : "";
    const rewardLabel = type === "support" ? "지원 / 혜택" : "상금 / 보상";
    const participationLabel = type === "support" ? "지원대상" : "참가";
    const conditionLabel = type === "support" ? "핵심 조건" : "예비창업자";
    const reward = cut(item.reward || item.aiSupport || "확인 필요", 52);
    const participation = cut(item.participation || "확인 필요", 46);
    const condition = cut(item.preStartup || item.businessRegistration || "확인 필요", 46);
    const tags = (item.tags || []).slice(0, 3).map((t) => '<span class="tag">' + esc(t) + "</span>").join("");

    return '<article class="opportunity-card type-' + type + ' tone-' + urgency + '" data-id="' + esc(item.id) + '">' +
      '<div class="opportunity-top"><div class="opportunity-badges">' + status + category + deadline + "</div>" +
      "<h3>" + esc(item.title) + "</h3>" +
      '<p class="opportunity-summary">' + esc(item.summary || "") + "</p></div>" +
      '<div class="key-facts">' +
      '<div class="fact fact-deadline"><b>마감</b><span>' + esc(item.deadlineText || item.dDay || "확인 필요") + "</span></div>" +
      '<div class="fact fact-reward"><b>' + rewardLabel + "</b><span>" + esc(reward) + "</span></div>" +
      '<div class="fact fact-participation"><b>' + participationLabel + "</b><span>" + esc(participation) + "</span></div>" +
      '<div class="fact fact-condition"><b>' + conditionLabel + "</b><span>" + esc(condition) + "</span></div>" +
      "</div>" +
      '<div class="card-footer"><div class="tag-row">' + tags + '</div><button type="button" class="detail-button">상세 보기</button></div>' +
      "</article>";
  }).join("");

  el.querySelectorAll(".opportunity-card").forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.id));
  });
}

function renderNewsList(sel, items) {
  const el = $(sel);
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">오늘 등록된 AI 뉴스가 아직 없습니다.<br>AI 브리핑 자동화가 실행되면 여기에 중요한 소식이 추가됩니다.</div>';
    return;
  }

  el.innerHTML = items.map((item) => {
    const why = item.description ? '<div class="news-why"><b>왜 봐야 해?</b><br>' + esc(cut(item.description, 120)) + "</div>" : "";
    const tags = (item.tags || []).slice(0, 3).map((t) => '<span class="tag">' + esc(t) + "</span>").join("");
    return '<article class="news-card type-ai" data-id="' + esc(item.id) + '">' +
      '<span class="news-time">' + esc(item.updatedAgo || "오늘") + "</span>" +
      "<h3>" + esc(item.title) + "</h3>" +
      "<p>" + esc(item.summary || "") + "</p>" +
      why +
      '<div class="card-footer"><div class="tag-row">' + tags + '</div><button type="button" class="detail-button">자세히</button></div>' +
      "</article>";
  }).join("");

  el.querySelectorAll(".news-card").forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.id));
  });
}

function renderArchive(days) {
  const el = $("#archiveDays");
  const current = state.data && state.data.date;

  el.innerHTML = days.slice(0, 12).map((d) => {
    const date = new Date(d + "T00:00:00+09:00");
    const weekday = ["일","월","화","수","목","금","토"][date.getDay()];
    return '<button class="archive-day ' + (d === current ? "active" : "") + '" data-date="' + d + '">' +
      "<small>" + (date.getMonth() + 1) + "월</small>" +
      "<strong>" + date.getDate() + "</strong>" +
      "<small>" + weekday + "</small></button>";
  }).join("") || '<span class="empty-state">아카이브가 쌓이면 여기에 표시됩니다.</span>';

  el.querySelectorAll(".archive-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = new URL(location.href);
      next.searchParams.set("date", btn.dataset.date);
      location.href = next.toString();
    });
  });
}

function openDetail(id) {
  const item = state.all.find((x) => x.id === id);
  if (!item) return;

  const isNews = (state.data.aiNews || []).some((x) => x.id === id);
  if (isNews) openNewsDetail(item);
  else openOpportunityDetail(item);
}

function openNewsDetail(item) {
  const links = item.links || [];
  const ideas = item.ideas || [];
  let ideaHtml = "";
  if (ideas.length) {
    ideaHtml = '<section class="detail-section"><h3>어떻게 써볼까?</h3><div class="idea-grid">' +
      ideas.map((idea, i) => '<article class="idea-card"><strong>적용 ' + (i + 1) + "</strong><p>" + esc(idea) + "</p></article>").join("") +
      "</div></section>";
  }

  let linkHtml = links.map((l, i) =>
    '<a class="' + (i > 0 ? "secondary-link" : "") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + " ↗</a>"
  ).join("");

  $("#dialogContent").innerHTML =
    '<div class="detail-shell detail-ai">' +
    '<section class="detail-hero"><div class="detail-badges"><span class="soft-badge category-badge category-ai">AI NEWS</span>' +
    (item.updatedAgo ? '<span class="soft-badge">' + esc(item.updatedAgo) + "</span>" : "") +
    "</div><h2>" + esc(item.title) + '</h2><p class="detail-summary">' + esc(item.summary || "") + "</p></section>" +
    '<section class="detail-section"><h3>무슨 일이야?</h3><div class="detail-box"><span>' + esc(item.description || item.summary || "") + "</span></div></section>" +
    (item.why ? '<section class="detail-section"><h3>왜 봐야 해?</h3><div class="detail-box"><span>' + esc(item.why) + "</span></div></section>" : "") +
    ideaHtml +
    '<div class="detail-actions">' + linkHtml + "</div></div>";

  $("#detailDialog").showModal();
}

function openOpportunityDetail(item) {
  const eligibility = [
    ["재직자 · 겸업", item.employment],
    ["사업자등록", item.businessRegistration]
  ].filter((x) => x[1]);

  const process = [
    ["접수 / 진행 일정", item.period],
    ["평가방식", item.evaluation],
    ["AI / 클라우드 지원", item.aiSupport]
  ].filter((x) => x[1]);

  const ideas = item.ideas || [];
  const links = item.links || [];
  const urgency = urgencyClass(item);
  const itemType = String(item.categoryLabel || "").includes("지원사업") ? "support" : "contest";

  const eligibilityHtml = eligibility.length
    ? eligibility.map((x) => '<div class="detail-box"><b>' + esc(x[0]) + "</b><span>" + esc(x[1]) + "</span></div>").join("")
    : '<div class="detail-box"><b>조건</b><span>공식 공고에서 추가 확인이 필요합니다.</span></div>';

  const processHtml = process.length
    ? process.map((x) => '<div class="detail-box"><b>' + esc(x[0]) + "</b><span>" + esc(x[1]) + "</span></div>").join("")
    : '<div class="detail-box"><b>진행 방식</b><span>공식 공고에서 추가 확인이 필요합니다.</span></div>';

  const ideaHtml = ideas.length
    ? '<section class="detail-section"><h3>이 공고로 바로 만들 수 있는 MVP</h3><p class="section-note">큰 기획보다 주말에 시작할 수 있는 크기로 정리했습니다.</p><div class="idea-grid">' +
      ideas.map((idea, i) => '<article class="idea-card"><strong>아이디어 ' + (i + 1) + "</strong><p>" + esc(idea) + "</p></article>").join("") +
      "</div></section>"
    : "";

  const linkHtml = links.map((l, i) =>
    '<a class="' + (i > 0 ? "secondary-link" : "") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + " ↗</a>"
  ).join("");

  $("#dialogContent").innerHTML =
    '<div class="detail-shell detail-' + itemType + ' tone-' + urgency + '">' +
    '<section class="detail-hero"><div class="detail-badges">' +
    (item.dDay ? '<span class="status-badge status-' + urgency + '">' + esc(item.dDay) + "</span>" : "") +
    '<span class="soft-badge category-badge category-' + itemType + '">' + esc(item.categoryLabel || "브리핑") + "</span>" +
    (item.deadlineText ? '<span class="soft-badge">마감 ' + esc(item.deadlineText) + "</span>" : "") +
    "</div><h2>" + esc(item.title) + '</h2><p class="detail-summary">' + esc(item.description || item.summary || "") + "</p>" +
    '<div class="decision-grid">' +
    '<div class="decision-card decision-deadline"><b>마감</b><span>' + esc(item.deadlineText || item.dDay || "확인 필요") + "</span></div>" +
    '<div class="decision-card decision-reward"><b>상금 / 지원</b><span>' + esc(cut(item.reward || "확인 필요", 64)) + "</span></div>" +
    '<div class="decision-card decision-participation"><b>참가 / 대상</b><span>' + esc(cut(item.participation || "확인 필요", 54)) + "</span></div>" +
    '<div class="decision-card decision-condition"><b>핵심 자격</b><span>' + esc(cut(item.preStartup || item.businessRegistration || "확인 필요", 54)) + "</span></div>" +
    "</div></section>" +
    '<section class="detail-section"><h3>내가 지원 가능한지</h3><p class="section-note">재직·겸업과 사업자 조건을 먼저 확인하세요.</p><div class="detail-grid">' + eligibilityHtml + "</div></section>" +
    '<section class="detail-section"><h3>진행 방식과 지원</h3><div class="detail-grid">' + processHtml + "</div></section>" +
    ideaHtml +
    '<div class="detail-actions">' + linkHtml + "</div></div>";

  $("#detailDialog").showModal();
}

function setupDialogs() {
  document.querySelectorAll(".dialog-close").forEach((btn) => btn.addEventListener("click", () => btn.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  $("#searchButton").addEventListener("click", () => {
    $("#searchDialog").showModal();
    setTimeout(() => $("#searchInput").focus(), 100);
  });

  $("#searchInput").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const results = q
      ? state.all.filter((x) => [x.title, x.summary, x.description].concat(x.tags || []).join(" ").toLowerCase().includes(q)).slice(0, 12)
      : [];

    $("#searchResults").innerHTML = results.map((x) =>
      '<div class="search-result" data-id="' + esc(x.id) + '"><b>' + esc(x.title) + "</b><span>" + esc(x.summary || "") + "</span></div>"
    ).join("") || (q ? '<div class="empty-state">검색 결과가 없습니다.</div>' : "");

    $("#searchResults").querySelectorAll(".search-result").forEach((r) => {
      r.addEventListener("click", () => {
        $("#searchDialog").close();
        openDetail(r.dataset.id);
      });
    });
  });
}

setupDialogs();
loadData().catch((err) => {
  console.error(err);
  document.querySelector("main").innerHTML = '<div class="empty-state">' + esc(err.message) + "</div>";
});
