// Per-source predicates selecting each crawler's mandatory review set
// (actionableItems). They must follow the collection scope in AUTOMATION.md:
// keep idea/proposal and software contests and startup support, and leave
// eligibility (region, business registration, team) to editorial review
// rather than excluding it here. Covered by scripts/test_actionability.mjs.

// ContestKorea category labels look like "학문•과학•IT".
const CONTEST_KOREA_LABEL = /[가-힣A-Za-z]+(?:•[가-힣A-Za-z]+)+/g;
const CONTEST_KOREA_IN_SCOPE_LABEL = /^(학문•과학•IT|아이디어•건축•창업)$/;
// Naming/slogan, literary, video/photo, art, performance and non-contest
// listings (supporters, reporters, hiring, training) are out of scope.
// Lookarounds keep words like 접수기간, 배우기 and 기자재 from matching.
const OUT_OF_SCOPE_CONTEST = /(명칭|네이밍|슬로건|표어|캐릭터|신춘문예|백일장|문학|글쓰기|(?<!접)수기|시 이어|영상|숏폼|영화|애니메이션|사진|그림|미술|디자인|웹툰|가요제|오디션|배우(?!기)|작가|예술가|서포터즈|기자(?!재)|봉사|채용|훈련생|교육과정|부트캠프|세미나|포럼|논문 공모)/;
const OUT_OF_SCOPE_SOTONG = /(영상|영화|퀴즈|굿즈|(?<!접)수기|사진|명칭|네이밍|슬로건|표어|캐릭터)/;
const CONTEST_TERM = /(공모|경진|대회|해커톤|아이디어톤|아이디어|챌린지|콘테스트)/;
// Software/AI/data work on video or photo material stays in scope, so these
// terms override the keyword exclusions (not an out-of-scope category label).
const TECH_TERM = /(AI|인공지능|데이터|해커톤|SW|소프트웨어|개발|앱|코딩|알고리즘)/;
const outOfScope = text => OUT_OF_SCOPE_CONTEST.test(text) && !TECH_TERM.test(text);

function contestKorea(item) {
  const text = item.rawText || "";
  const labels = text.match(CONTEST_KOREA_LABEL) || [];
  const body = text.replace(CONTEST_KOREA_LABEL, " ");
  if (outOfScope(body)) return false;
  if (labels.some(label => CONTEST_KOREA_IN_SCOPE_LABEL.test(label))) return true;
  if (labels.length) return false;
  return CONTEST_TERM.test(body);
}

const GRANTLY_RELEVANT = /(창업|스타트업|AI|인공지능|개발|멘토링|교육|프로그램|아이디어|경진대회|해커톤|입주|시장·고객|\bIR\b|피칭|오피스아워|액셀러|엑셀러|인큐베|보육|사업화|투자)/;
// Trade shows and non-startup business programmes; region tags and
// "기업 모집" wording are eligibility conditions, not exclusions.
const GRANTLY_NOT_STARTUP = /(여성CEO|농업인|수출|전시회|박람회|해외 ?전시|착한가격업소|방지시설)/;

export const ACTIONABLE = {
  dakerHackathons: item => /(모집중|접수중|참가 신청하기)/.test(item.rawText || ""),
  hackathonKorea: item => !/종료/.test(item.rawText || ""),
  sotong24Contests: item => /(아이디어|제안|혁신|공모)/.test(item.rawText || "")
    && !(OUT_OF_SCOPE_SOTONG.test(item.rawText || "")
      && !TECH_TERM.test(item.rawText || "")),
  grantlySupport: item => GRANTLY_RELEVANT.test(item.rawText || "")
    && !GRANTLY_NOT_STARTUP.test(item.rawText || ""),
  devpostOpen: () => true,
  contestKorea,
  // K-Startup lists application programmes; only spectator/hiring notices are not.
  kStartupHighlights: item => !/(참관객|채용설명회)/.test(item.rawText || ""),
};
