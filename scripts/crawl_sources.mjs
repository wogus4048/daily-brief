import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const SEOUL_TZ = "Asia/Seoul";
const OUTPUT_DIR = path.resolve("data/source-cache");
const MANIFEST_PATH = path.resolve("data/crawler-sources.json");
const ACTIONABLE_HINTS = [
  "참가신청중",
  "접수중",
  "진행중",
  "진행 중",
  "모집중",
  "모집 중",
  "접수예정",
  "접수 예정",
  "예정",
  "오늘마감",
  "오늘 마감",
  "마감임박",
  "days left",
  "day left",
];

function seoulDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

function normalizeUrl(value) {
  const u = new URL(value);
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|ref$|ref_|trk$|fbclid$|gclid$)/i.test(key)) {
      u.searchParams.delete(key);
    }
  }
  u.searchParams.sort();
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function chooseTitle(rawText, fallback, source = "") {
  const flatText = cleanText(rawText);

  if (source === "DAKER") {
    const tierMatch = flatText.match(/(?:프리미엄|스탠다드)\s+(.+?)(?:\s+총\s*상금|\s+\d[\d,]*팀\s+참가|\s+참가\s+신청하기)/);
    if (tierMatch?.[1]) return cleanText(tierMatch[1]);
    const yearMatch = flatText.match(/\b(20\d{2}\s+.+?)(?:\s+총\s*상금|\s+\d[\d,]*팀\s+참가|\s+참가\s+신청하기)/);
    if (yearMatch?.[1]) return cleanText(yearMatch[1]);
  }

  const blocked = /^(참가신청중|접수중|진행중|마감|연습|종료|예정|더보기)$/;
  const metadata = /^(알고리즘\s*\||아이디어\s*\||데브톤\s*\||해커톤\s*\||시작까지|종료까지|D[-+]?\d+|\d+명|상금\s|총상금\s)/;
  const lines = String(rawText || "")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean)
    .filter(line => !blocked.test(line))
    .filter(line => !metadata.test(line))
    .filter(line => line.length >= 4 && line.length <= 180);

  if (lines.length) return lines[0];

  const cut = flatText.split(/\s+(?:알고리즘|아이디어|데브톤|해커톤)\s*\||\s+(?:참가신청중|접수중|진행중|마감|연습|종료)\b/)[0];
  return cleanText(cut) || fallback || "제목 확인 필요";
}

function statusHints(rawText) {
  const text = cleanText(rawText);
  return ACTIONABLE_HINTS.filter(token => text.toLowerCase().includes(token.toLowerCase()));
}

function isActionableByHints(item) {
  if ((item.statusHints || []).length) return true;
  const text = cleanText(item.rawText);
  return /\bD-\d+\b/i.test(text);
}

async function expandListing(page, hrefSelector, label) {
  let stagnant = 0;
  let previousCount = await page.locator(hrefSelector).count();

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const more = page.locator("button, a").filter({ hasText: /^\s*(더보기|more|load more)\s*$/i });
    let clicked = false;

    for (let i = (await more.count()) - 1; i >= 0; i -= 1) {
      const item = more.nth(i);
      if (await item.isVisible().catch(() => false)) {
        await item.scrollIntoViewIfNeeded().catch(() => {});
        await item.click({ timeout: 5000 }).catch(() => {});
        clicked = true;
        break;
      }
    }

    if (!clicked) break;

    await page.waitForTimeout(900);
    const currentCount = await page.locator(hrefSelector).count();
    if (currentCount <= previousCount) stagnant += 1;
    else {
      stagnant = 0;
      previousCount = currentCount;
    }
    if (stagnant >= 2) break;
  }

  return { label, anchorCount: await page.locator(hrefSelector).count() };
}

async function scrollListing(page, selector, rounds = 20) {
  let previous = await page.locator(selector).count();
  let stagnant = 0;
  for (let i = 0; i < rounds; i += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
    const current = await page.locator(selector).count();
    if (current <= previous) stagnant += 1;
    else {
      previous = current;
      stagnant = 0;
    }
    if (stagnant >= 3) break;
  }
}

async function collectAnchors(page, hrefSelector, source) {
  const rows = await page.evaluate((selector) =>
    [...document.querySelectorAll(selector)].map((a) => {
      const parentText = a.closest("article, li, [class*='card'], [class*='item'], [class*='contest'], [class*='hackathon'], tr, section")?.innerText;
      return {
        href: a.href,
        text: a.innerText || a.textContent || "",
        context: parentText || "",
      };
    }), hrefSelector
  );

  const byUrl = new Map();
  for (const row of rows || []) {
    if (!row.href) continue;
    let url;
    try { url = normalizeUrl(row.href); } catch { continue; }
    const rawText = cleanText(row.context || row.text);
    if (!rawText) continue;
    const current = byUrl.get(url);
    if (!current || rawText.length > current.rawText.length) {
      byUrl.set(url, {
        source,
        title: chooseTitle(row.context || row.text, url, source),
        url,
        rawText,
        statusHints: statusHints(rawText),
      });
    }
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

async function collectAnchorsSafe(page, hrefSelector, source) {
  const locator = page.locator(hrefSelector);
  const count = await locator.count();
  const byUrl = new Map();

  for (let i = 0; i < count; i += 1) {
    const a = locator.nth(i);
    const hrefAttr = await a.getAttribute("href").catch(() => null);
    const text = await a.textContent().catch(() => "");
    const context = await a.evaluate((el) => {
      const parent = el.closest("article, li, [class*='card'], [class*='item'], [class*='list'], tr, section");
      return parent?.innerText || "";
    }).catch(() => "");
    if (!hrefAttr) continue;

    let url;
    try { url = normalizeUrl(new URL(hrefAttr, page.url()).toString()); } catch { continue; }
    const rawText = cleanText(context || text || "");
    if (!rawText) continue;
    byUrl.set(url, {
      source,
      title: chooseTitle(context || text || rawText, url, source),
      url,
      rawText,
      statusHints: statusHints(rawText),
    });
  }

  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function withActionable(base, predicate = isActionableByHints) {
  const items = base.items || [];
  const actionableItems = items.filter(predicate);
  return {
    ...base,
    count: items.length,
    actionableItems,
    actionableCount: actionableItems.length,
  };
}

async function safeCrawl(key, fn) {
  try {
    return await fn();
  } catch (error) {
    return {
      key,
      status: "FAILED",
      error: String(error?.stack || error),
      items: [],
      count: 0,
      actionableItems: [],
      actionableCount: 0,
    };
  }
}

async function crawlDacon(page) {
  const url = "https://www.dacon.io/competitions";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
  const selector = 'a[href*="/competitions/official/"]';
  const expansion = await expandListing(page, selector, "DACON competitions");
  const items = (await collectAnchors(page, selector, "DACON"))
    .filter(item => new URL(item.url).hostname.endsWith("dacon.io"));
  if (!items.length) throw new Error("DACON crawler returned zero competition items");
  return withActionable({ key: "daconCompetitions", status: "OK", url, expansion, items });
}

async function crawlDaker(page) {
  const url = "https://daker.ai/public/hackathons";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
  const selector = 'a[href*="/public/hackathons/"]';
  const expansion = await expandListing(page, selector, "DAKER hackathons");
  const items = (await collectAnchors(page, selector, "DAKER"))
    .filter(item => {
      const u = new URL(item.url);
      return u.hostname.endsWith("daker.ai") && u.pathname !== "/public/hackathons";
    });
  if (!items.length) throw new Error("DAKER crawler returned zero hackathon items");
  return withActionable(
    { key: "dakerHackathons", status: "OK", url, expansion, items },
    item => /(모집중|접수중|참가 신청하기)/.test(item.rawText || "")
  );
}

async function crawlHackathonKorea(page) {
  const url = "https://koreahackathons.com/";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  const selector = 'a[href*="/events/"]';
  let items = await collectAnchors(page, selector, "Hackathon Korea");
  const hubPaths = new Set([
    "/hackathons/seoul", "/hackathons/busan", "/hackathons/daejeon", "/hackathons/daegu",
    "/hackathons/incheon", "/hackathons/gwangju", "/hackathons/pangyo"
  ]);
  items = items.filter(item => {
    const u = new URL(item.url);
    return u.hostname.endsWith("koreahackathons.com") && u.pathname.startsWith("/events/");
  });
  if (!items.length) throw new Error("Hackathon Korea crawler returned zero items");
  return withActionable(
    { key: "hackathonKorea", status: "OK", url, items },
    item => !/종료/.test(item.rawText || "")
  );
}

async function crawlSotong24(page) {
  const url = "https://sotong.go.kr/front/epilogue/epilogueBbsList.do";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  const selector = 'a[href*="epilogueNewViewPage.do"]';
  await expandListing(page, selector, "소통24 공모전");
  let items = (await collectAnchorsSafe(page, selector, "소통24"))
    .filter(item => item.url.includes("sotong.go.kr/front/epilogue/epilogueNewViewPage.do"));

  if (!items.length) {
    const rows = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("a, button, li, tr, [onclick], [data-id], [data-bbs-id]")) {
        const attrs = [...el.attributes].map(a => `${a.name}=${a.value}`).join(" ");
        const match = attrs.match(/[0-9a-f]{32}/i);
        if (!match) continue;
        const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        out.push({ id: match[0], text, attrs });
      }
      return out;
    });

    const byId = new Map();
    for (const row of rows || []) {
      const rawText = cleanText(row.text);
      if (!rawText) continue;
      const current = byId.get(row.id);
      if (!current || rawText.length > current.rawText.length) {
        const detailUrl = `https://sotong.go.kr/front/epilogue/epilogueNewViewPage.do?bbs_id=${row.id}&menu_id=527&pagetype=bbs`;
        byId.set(row.id, {
          source: "소통24",
          title: chooseTitle(rawText, `소통24 공모전 ${row.id.slice(0, 8)}`, "소통24"),
          url: normalizeUrl(detailUrl),
          rawText,
          statusHints: statusHints(rawText),
        });
      }
    }
    items = [...byId.values()].sort((a, b) => a.url.localeCompare(b.url));
  }

  if (!items.length) throw new Error("소통24 crawler returned zero contest items");
  return withActionable(
    { key: "sotong24Contests", status: "OK", url, items },
    item => /(아이디어|제안|혁신|공모)/.test(item.rawText || "")
      && !/(영상|영화|퀴즈|굿즈|수기|사진)/.test(item.rawText || "")
  );
}

async function crawlGrantly(page) {
  const url = "https://grantly.kr/opportunities/support";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1400);
  const selector = 'a[href*="/opportunities/"]';
  await expandListing(page, selector, "Grantly support");
  const items = (await collectAnchors(page, selector, "Grantly"))
    .filter(item => {
      const u = new URL(item.url);
      return u.hostname.endsWith("grantly.kr")
        && /^\/opportunities\/\d+\/?$/.test(u.pathname);
    });
  if (!items.length) throw new Error("Grantly crawler returned zero items");
  return withActionable(
    { key: "grantlySupport", status: "OK", url, items },
    item => {
      const text = item.rawText || "";
      const relevant = /(창업|AI|인공지능|개발|멘토링|교육|프로그램|아이디어|경진대회|해커톤|스타트업|입주|시장·고객)/.test(text);
      const obviousMismatch = /(\[경북\]|\[대구\]|\[강원\]|\[전북\]|참여기업|기업 모집|기업모집|여성CEO|농업인|수출|해외 전시|착한가격업소)/.test(text);
      return relevant && !obviousMismatch;
    }
  );
}

async function crawlDevpost(page) {
  const url = "https://devpost.com/hackathons?status=open";
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (response && !response.ok()) throw new Error(`Devpost HTTP ${response.status()}: source unavailable or access blocked`);
  await page.waitForTimeout(1200);
  if (/verify you are human|performing security verification|보안 확인 수행|just a moment/i.test(await page.locator('body').innerText())) {
    throw new Error('Devpost access blocked by security verification');
  }
  const selector = 'a[href*="devpost.com"]';
  await scrollListing(page, selector, 25);
  const items = (await collectAnchors(page, selector, "Devpost"))
    .filter(item => {
      const u = new URL(item.url);
      const blockedHosts = new Set(["info.devpost.com", "secure.devpost.com"]);
      return u.hostname.endsWith(".devpost.com")
        && u.hostname !== "devpost.com"
        && !blockedHosts.has(u.hostname)
        && /(days? left|about \d+ months? left|about 1 month left|\b20\d{2}\b)/i.test(item.rawText || "");
    });
  if (!items.length) throw new Error("Devpost crawler returned zero open hackathons");
  return withActionable({ key: "devpostOpen", status: "OK", url, items }, () => true);
}

async function crawlContestKorea(page) {
  const url = "https://contestkorea.kr/";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  const selector = 'a[href*="/sub/view.php"], a[href*="sub/view.php"]';
  const items = (await collectAnchors(page, selector, "ContestKorea"))
    .filter(item => new URL(item.url).hostname.includes("contestkorea"));
  if (!items.length) throw new Error("ContestKorea crawler returned zero items");
  return withActionable(
    { key: "contestKorea", status: "OK", url, items },
    item => /(학문•과학•IT|아이디어•건축•창업)/.test(item.rawText || "")
      && !/(논문 공모|외국인\s+접수)/.test(item.rawText || "")
  );
}

async function crawlKStartup(page) {
  const url = "https://www.k-startup.go.kr/web/main/mainSection0.do";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
  const items = (await collectAnchors(page, "a[href]", "K-Startup"))
    .filter(item => {
      const u = new URL(item.url);
      const text = cleanText(item.rawText);
      return u.hostname.endsWith("k-startup.go.kr")
        && u.pathname.includes("/web/contents/bizpbanc-ongoing.do")
        && u.searchParams.get("pbancSn")
        && u.searchParams.get("schM") === "view"
        && /(모집|공고|창업|마감|경진대회|챌린지|프로그램)/.test(text)
        && text.length >= 8;
    });
  if (!items.length) throw new Error("K-Startup crawler returned zero highlighted announcements");
  return withActionable(
    { key: "kStartupHighlights", status: "OK", url, items },
    item => /(아이디어|경진대회|교육|상담|프로그램|예비창업|청년|시장·고객)/.test(item.rawText || "")
      && !/(입주기업|참여기업|창업기업 인증)/.test(item.rawText || "")
  );
}

async function crawlGeneric(page, key, name, spec) {
  const url = spec.url;
  if (!url || !spec.linkSelector) {
    throw new Error(`generic crawler ${key} missing url/linkSelector`);
  }

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: spec.timeoutMs || 60000 });
  await page.waitForTimeout(spec.waitMs || 1200);

  if (spec.expand !== false) {
    await expandListing(page, spec.linkSelector, name || key);
  }
  if (spec.scrollRounds) {
    await scrollListing(page, spec.linkSelector, spec.scrollRounds);
  }

  let items = await collectAnchorsSafe(page, spec.linkSelector, name || key);

  if (spec.hostSuffix) {
    items = items.filter(item => new URL(item.url).hostname.endsWith(spec.hostSuffix));
  }
  if (spec.urlContains) {
    items = items.filter(item => item.url.includes(spec.urlContains));
  }
  if (spec.urlRegex) {
    const rx = new RegExp(spec.urlRegex);
    items = items.filter(item => rx.test(item.url));
  }
  if (spec.excludeUrlRegex) {
    const rx = new RegExp(spec.excludeUrlRegex);
    items = items.filter(item => !rx.test(item.url));
  }

  if (!items.length) {
    throw new Error(`generic crawler ${key} returned zero items`);
  }

  const predicate = spec.actionability === "all" ? () => true : isActionableByHints;
  return withActionable({ key, status: "OK", url, items }, predicate);
}

async function main() {
  const now = new Date();
  const date = seoulDate(now);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));

  const builtIns = new Map([
    ["daconCompetitions", crawlDacon],
    ["dakerHackathons", crawlDaker],
    ["hackathonKorea", crawlHackathonKorea],
    ["sotong24Contests", crawlSotong24],
    ["grantlySupport", crawlGrantly],
    ["devpostOpen", crawlDevpost],
    ["contestKorea", crawlContestKorea],
    ["kStartupHighlights", crawlKStartup],
  ]);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      locale: "ko-KR",
      timezoneId: SEOUL_TZ,
      viewport: { width: 1440, height: 1600 },
    });

    async function runEntry(entry, shadow = false) {
      const key = entry.key;
      const page = await context.newPage();
      try {
        const builtIn = builtIns.get(key);
        const result = await safeCrawl(key, () => {
          if (builtIn) return builtIn(page);
          if (entry.crawlerSpec) return crawlGeneric(page, key, entry.name || key, entry.crawlerSpec);
          throw new Error(`no crawler implementation/spec for ${key}`);
        });
        return [key, { ...result, shadow }];
      } finally {
        await page.close().catch(() => {});
      }
    }

    const activeEntries = (manifest.active || []).filter(entry => entry.status !== "DEGRADED");
    const sourceEntries = await Promise.all(activeEntries.map(entry => runEntry(entry, false)));
    const sources = Object.fromEntries(sourceEntries);

    const shadowEntries = [
      ...(manifest.nextCandidates || []).filter(entry => entry.status === "SHADOW" && entry.crawlerSpec),
      ...(manifest.degraded || []).filter(entry => builtIns.has(entry.key) || entry.crawlerSpec),
    ];
    const shadowPairs = await Promise.all(shadowEntries.map(entry => runEntry(entry, true)));
    const shadowSources = Object.fromEntries(shadowPairs);

    const totals = Object.fromEntries(
      Object.entries(sources).flatMap(([key, value]) => [
        [key, value.count || 0],
        [`${key}Actionable`, value.actionableCount || 0],
      ])
    );

    const output = {
      date,
      generatedAt: now.toISOString(),
      timezone: SEOUL_TZ,
      crawler: { engine: "playwright-chromium", version: 4 },
      sources,
      shadowSources,
      totals,
    };

    const json = JSON.stringify(output, null, 2) + "\n";
    await fs.writeFile(path.join(OUTPUT_DIR, `${date}.json`), json, "utf8");
    await fs.writeFile(path.join(OUTPUT_DIR, "latest.json"), json, "utf8");

    console.log("Saved source cache", date);
    for (const [key, value] of Object.entries(sources)) {
      console.log(`active ${key}: ${value.status} ${value.count || 0}/${value.actionableCount || 0} actionable`);
    }
    for (const [key, value] of Object.entries(shadowSources)) {
      console.log(`shadow ${key}: ${value.status} ${value.count || 0}/${value.actionableCount || 0} actionable`);
    }
    // Persist diagnostics before failing so Actions can retain evidence of required-source failures.
    for (const entry of activeEntries.filter(entry => entry.required)) {
      const source = sources[entry.key];
      if (!source || source.status !== "OK" || !source.count) {
        throw new Error(`mandatory crawler failed: ${entry.key}: ${source?.error || "empty or missing"}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
