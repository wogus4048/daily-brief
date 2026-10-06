import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const SEOUL_TZ = "Asia/Seoul";
const OUTPUT_DIR = path.resolve("data/source-cache");

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
  u.search = "";
  u.hash = "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function chooseTitle(rawText, fallback) {
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

  const flat = cleanText(rawText);
  const cut = flat.split(/\s+(?:알고리즘|아이디어|데브톤|해커톤)\s*\||\s+(?:참가신청중|접수중|진행중|마감|연습|종료)\b/)[0];
  return cleanText(cut) || fallback || "제목 확인 필요";
}

function statusHints(rawText) {
  const text = cleanText(rawText);
  const tokens = [
    "참가신청중",
    "접수중",
    "진행중",
    "모집중",
    "마감",
    "종료",
    "연습",
    "예정",
  ];
  return tokens.filter(token => text.includes(token));
}

async function expandListing(page, hrefSelector, label) {
  let stagnant = 0;
  let previousCount = await page.locator(hrefSelector).count();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const more = page.locator("button, a").filter({ hasText: /^\s*더보기\s*$/ });
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
    if (currentCount <= previousCount) {
      stagnant += 1;
    } else {
      stagnant = 0;
      previousCount = currentCount;
    }
    if (stagnant >= 2) break;
  }

  return {
    label,
    anchorCount: await page.locator(hrefSelector).count(),
  };
}

async function collectAnchors(page, hrefSelector, source) {
  const rows = await page.locator(hrefSelector).evaluateAll((anchors) =>
    anchors.map((a) => {
      const parentText = a.closest("article, li, [class*='card'], [class*='item'], [class*='contest'], [class*='hackathon']")?.innerText;
      return {
        href: a.href,
        text: a.innerText || a.textContent || "",
        context: parentText || "",
      };
    })
  );

  const byUrl = new Map();
  for (const row of rows) {
    if (!row.href) continue;
    let url;
    try {
      url = normalizeUrl(row.href);
    } catch {
      continue;
    }
    const rawText = cleanText(row.context || row.text);
    const current = byUrl.get(url);
    if (!current || rawText.length > current.rawText.length) {
      byUrl.set(url, {
        source,
        title: chooseTitle(row.context || row.text, url),
        url,
        rawText,
        statusHints: statusHints(rawText),
      });
    }
  }

  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

async function crawlDacon(page) {
  const url = "https://www.dacon.io/competitions";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);

  const selector = 'a[href*="/competitions/official/"]';
  const expansion = await expandListing(page, selector, "DACON competitions");

  const items = (await collectAnchors(page, selector, "DACON"))
    .filter(item => new URL(item.url).hostname.endsWith("dacon.io"));

  if (items.length === 0) {
    throw new Error("DACON crawler returned zero competition items");
  }

  return {
    url,
    count: items.length,
    expansion,
    items,
  };
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

  if (items.length === 0) {
    throw new Error("DAKER crawler returned zero hackathon items");
  }

  return {
    url,
    count: items.length,
    expansion,
    items,
  };
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

    const daconPage = await context.newPage();
    const dakerPage = await context.newPage();

    const [daconCompetitions, dakerHackathons] = await Promise.all([
      crawlDacon(daconPage),
      crawlDaker(dakerPage),
    ]);

    const output = {
      date,
      generatedAt: now.toISOString(),
      timezone: SEOUL_TZ,
      crawler: {
        engine: "playwright-chromium",
        version: 1,
      },
      sources: {
        daconCompetitions,
        dakerHackathons,
      },
      totals: {
        daconCompetitions: daconCompetitions.count,
        dakerHackathons: dakerHackathons.count,
      },
    };

    const json = JSON.stringify(output, null, 2) + "\n";
    await fs.writeFile(path.join(OUTPUT_DIR, `${date}.json`), json, "utf8");
    await fs.writeFile(path.join(OUTPUT_DIR, "latest.json"), json, "utf8");

    console.log(
      `OK: source cache ${date} (DACON ${daconCompetitions.count}, DAKER ${dakerHackathons.count})`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
