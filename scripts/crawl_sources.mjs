import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const SEOUL_TZ = "Asia/Seoul";
const OUTPUT_DIR = path.resolve("data/source-cache");
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
    Array.from(document.querySelectorAll(selector)).map((a) => {
      const parentText = a.closest("article, li, [class*='card'], [class*='item'], [class*='contest'], [class*='hackathon'], tr, section")?.innerText;
      return {
        href: a.href,
        text: a.innerText || a.textContent || "",
        context: parentText || "",
      };
    }), hrefSelector
  );

  const byUrl = new Map();
  for (const row of rows) {
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
  return withActionable({ key: "dakerHackathons", status: "OK", url, expansion, items });
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
  return withActionable({ key: "hackathonKorea", status: "OK", url, items }, () => true);
}

async function crawlSotong24(page) {
  const url = "https://sotong.go.kr/front/epilogue/epilogueBbsListPage.do?menu_id=519";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const selector = 'a[href*="epilogueNewViewPage.do"]';
  await expandListing(page, selector, "소통24 공모전");
  const items = (await collectAnchors(page, selector, "소통24"))
    .filter(item => item.url.includes("sotong.go.kr/front/epilogue/epilogueNewViewPage.do"));
  if (!items.length) throw new Error("소통24 crawler returned zero contest items");
  return withActionable({ key: "sotong24Contests", status: "OK", url, items }, () => true);
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
      return u.hostname.endsWith("grantly.kr") && u.pathname !== "/opportunities/support";
    });
  if (!items.length) throw new Error("Grantly crawler returned zero items");
  return withActionable({ key: "grantlySupport", status: "OK", url, items }, () => true);
}

async function crawlDevpost(page) {
  const url = "https://devpost.com/hackathons?status=open";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const selector = 'a[href*="devpost.com"]';
  await scrollListing(page, selector, 25);
  const items = (await collectAnchors(page, selector, "Devpost"))
    .filter(item => {
      const u = new URL(item.url);
      return u.hostname.endsWith(".devpost.com") && u.hostname !== "devpost.com";
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
  return withActionable({ key: "contestKorea", status: "OK", url, items });
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
        && /(모집|공고|창업|마감|경진대회|챌린지|프로그램)/.test(text)
        && text.length >= 8;
    });
  if (!items.length) throw new Error("K-Startup crawler returned zero highlighted announcements");
  return withActionable({ key: "kStartupHighlights", status: "OK", url, items }, () => true);
}

async function main() {
  const now = new Date();
  const date = seoulDate(now);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: "ko-KR",
      timezoneId: SEOUL_TZ,
      viewport: { width: 1440, height: 1600 },
    });

    const jobs = [
      ["daconCompetitions", crawlDacon],
      ["dakerHackathons", crawlDaker],
      ["hackathonKorea", crawlHackathonKorea],
      ["sotong24Contests", crawlSotong24],
      ["grantlySupport", crawlGrantly],
      ["devpostOpen", crawlDevpost],
      ["contestKorea", crawlContestKorea],
      ["kStartupHighlights", crawlKStartup],
    ];

    const entries = await Promise.all(jobs.map(async ([key, fn]) => {
      const page = await context.newPage();
      try { return [key, await safeCrawl(key, () => fn(page))]; }
      finally { await page.close().catch(() => {}); }
    }));

    const sources = Object.fromEntries(entries);

    for (const required of ["daconCompetitions", "dakerHackathons"]) {
      if (sources[required].status !== "OK") {
        throw new Error(`mandatory crawler failed: ${required}: ${sources[required].error}`);
      }
    }

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
      crawler: { engine: "playwright-chromium", version: 3 },
      sources,
      totals,
    };

    const json = JSON.stringify(output, null, 2) + "\n";
    await fs.writeFile(path.join(OUTPUT_DIR, `${date}.json`), json, "utf8");
    await fs.writeFile(path.join(OUTPUT_DIR, "latest.json"), json, "utf8");

    console.log("OK: source cache", date);
    for (const [key, value] of Object.entries(sources)) {
      console.log(
        `${key}: ${value.status} ${value.count || 0}/${value.actionableCount || 0} actionable`
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
