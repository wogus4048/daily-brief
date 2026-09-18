
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
    const status = item.dDay ? '<span class="status-pill status-' + urgency + '">' + esc(item.dDay) + '</span>' : "";
    const category = '<span class="meta-pill">' + esc(item.categoryLabel || (type === "support" ? "지원사업" : "공모전·해커톤")) + '</span>';
    const reward = cut(item.reward || item.aiSupport || "확인 필요", 42);
    const participation = cut(item.participation || "확인 필요", 38);
    const tags = (item.tags || []).slice(0, 3).map((t) => '<span class="tag">' + esc(t) + '</span>').join("");

    return '<article class="brief-row type-' + type + '" data-id="' + esc(item.id) + '">' +
      '<div class="brief-row-main">' +
        '<div class="brief-row-meta">' + status + category + '</div>' +
        '<h3>' + esc(item.title) + '</h3>' +
        '<p class="brief-row-summary">' + esc(item.summary || "") + '</p>' +
        '<div class="tag-row">' + tags + '</div>' +
      '</div>' +
      '<div class="brief-row-facts">' +
        '<div class="brief-fact"><span>마감</span><strong>' + esc(item.deadlineText || item.dDay || "확인 필요") + '</strong></div>' +
        '<div class="brief-fact"><span>' + (type === "support" ? "지원 / 혜택" : "상금 / 보상") + '</span><strong>' + esc(reward) + '</strong></div>' +
        '<div class="brief-fact"><span>' + (type === "support" ? "지원 대상" : "참가") + '</span><strong>' + esc(participation) + '</strong></div>' +
        '<button type="button" class="detail-button">상세 보기</button>' +
      '</div>' +
    '</article>';
  }).join("");

  el.querySelectorAll(".brief-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      openDetail(row.dataset.id);
    });
  });
}

function renderNewsList(sel, items) {
  const el = $(sel);
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">오늘 등록된 AI 뉴스가 아직 없습니다.<br>AI 브리핑 자동화가 실행되면 여기에 중요한 소식이 추가됩니다.</div>';
    return;
  }

  el.innerHTML = items.map((item) => {
    const tags = (item.tags || []).slice(0, 3).map((t) => '<span class="tag">' + esc(t) + '</span>').join("");
    return '<article class="news-row" data-id="' + esc(item.id) + '">' +
      '<div class="news-row-main">' +
        '<div class="brief-row-meta"><span class="meta-pill">AI NEWS</span><span class="news-time">' + esc(item.updatedAgo || "오늘") + '</span></div>' +
        '<h3>' + esc(item.title) + '</h3>' +
        '<p>' + esc(item.summary || "") + '</p>' +
        '<div class="tag-row">' + tags + '</div>' +
      '</div>' +
      '<div class="news-row-side">' +
        '<span>왜 봐야 해?</span>' +
        '<p>' + esc(cut(item.why || item.description || item.summary || "", 90)) + '</p>' +
        '<button type="button" class="detail-button">자세히</button>' +
      '</div>' +
    '</article>';
  }).join("");

  el.querySelectorAll(".news-row").forEach((row) => {
    row.addEventListener("click", () => openDetail(row.dataset.id));
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
  const links = item.links || [];
  const ideas = item.ideas || [];
  const urgency = urgencyClass(item);

  const eligibility = [
    ["참가 / 대상", item.participation],
    ["예비창업자", item.preStartup],
    ["재직자 · 겸업", item.employment],
    ["사업자등록", item.businessRegistration]
  ].filter((x) => x[1]);

  const process = [
    ["접수 / 진행 일정", item.period],
    ["상금 / 지원", item.reward],
    ["평가방식", item.evaluation],
    ["AI / 클라우드 지원", item.aiSupport]
  ].filter((x) => x[1]);

  const rows = (arr) => arr.map((x) =>
    '<div class="detail-line"><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></div>'
  ).join("");

  const ideaHtml = ideas.length
    ? '<section class="detail-section"><h3>이 공고로 뭘 해볼까?</h3><div class="idea-list">' +
      ideas.map((idea, i) => '<div class="idea-line"><span>' + (i + 1) + '</span><p>' + esc(idea) + '</p></div>').join("") +
      '</div></section>'
    : "";

  const linkHtml = links.map((l, i) =>
    '<a class="' + (i > 0 ? "secondary-link" : "") + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' ↗</a>'
  ).join("");

  $("#dialogContent").innerHTML =
    '<div class="detail-shell">' +
      '<section class="detail-hero clean-detail">' +
        '<div class="detail-badges">' +
          (item.dDay ? '<span class="status-pill status-' + urgency + '">' + esc(item.dDay) + '</span>' : "") +
          '<span class="meta-pill">' + esc(item.categoryLabel || "브리핑") + '</span>' +
        '</div>' +
        '<h2>' + esc(item.title) + '</h2>' +
        '<p class="detail-summary">' + esc(item.description || item.summary || "") + '</p>' +
        '<div class="detail-keybar">' +
          '<div><span>마감</span><strong>' + esc(item.deadlineText || item.dDay || "확인 필요") + '</strong></div>' +
          '<div><span>상금 / 지원</span><strong>' + esc(cut(item.reward || "확인 필요", 70)) + '</strong></div>' +
        '</div>' +
      '</section>' +
      '<section class="detail-section"><h3>지원 조건</h3><div class="detail-lines">' + rows(eligibility) + '</div></section>' +
      '<section class="detail-section"><h3>진행 방식</h3><div class="detail-lines">' + rows(process) + '</div></section>' +
      ideaHtml +
      '<div class="detail-actions">' + linkHtml + '</div>' +
    '</div>';

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
