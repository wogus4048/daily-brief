import assert from 'node:assert/strict';
import { ACTIONABLE } from './actionability.mjs';

// Real listing texts from data/source-cache/2026-10-13.json. The mandatory
// review set must follow the collection scope in AUTOMATION.md: idea/proposal
// and software contests, and startup support unless business registration is
// explicitly required. Naming/slogan, literary, video/photo and art contests
// are out of scope (user decision, 2026-10-13).
const item = rawText => ({ title: rawText, rawText });
const check = (key, rawText, expected) =>
  assert.equal(ACTIONABLE[key](item(rawText)), expected, `${key}: ${rawText}`);

// ContestKorea: in-scope items without a category label were dropped before.
for (const text of [
  'D-5 제2회 ZYXCAD AX 경진대회',
  '7. 2026 제주 관광 데이터 활용사례 공모전',
  '7. 「동성로 LOCAL UP!! 아이디어톤」 참여자 모집',
  '4. 제7회 하이라이트TV AI 공모전',
  '학문•과학•IT 나랏돈 50조 찾기 프로젝트 : 나라장터 해커톤 0 주최 . 개혁신당 대상 . 누구나',
  '아이디어•건축•창업 문화·관광·콘텐츠 분야 대국민 연구 아이디어 공모 8 주최 . 한국문화관광연구원',
  '아이디어•건축•창업 요리•뷰티•배우•오디션 2026 충남 로컬메이드 제품개발 공모전 0 주최 . 선문대학교',
  // Software/AI work on video or photo data is in scope (catalog: dacon-blackbox-236753).
  '블랙박스 영상 기반 지능형 고의사고 분석 모델 AI 경진대회',
]) check('contestKorea', text, true);
// Exclusion words must not match inside unrelated words (접수기간, 배우기, 기자재).
check('contestKorea', 'D-9 2026 스마트시티 정책 제안 공모전 접수기간 26.10.01~26.10.31', true);
check('contestKorea', 'D-9 2026 실버세대 디지털 배우기 아이디어 공모전', true);
check('contestKorea', 'D-9 2026 교육 기자재 혁신 아이디어 공모전', true);
check('contestKorea', '8. 제2회 화성시 공공디자인 공모전', false);
// A video festival stays out even when it mentions AI.
check('contestKorea', '사진•영상•영화제 2026 경상북도 K-U시티 청년 AI영상제 0 주최 . 경상북도', false);
for (const text of [
  '1. \'완도 대표축제\' 명칭 공모',
  '10. 맑은물에 두유 네이밍 공모전',
  '7. 경남교육 브랜드 슬로건 공모전',
  '6. 제21회 건설사업관리(CM) 표어 온라인 공모전',
  '4. 김해시 캐릭터‧슬로건 공모전',
  '네이밍•슬로건 우리 동네 병원과 가까워지는 한마디 슬로건 공모전 0 주최 . 건강보험심사평가원',
  '문학•문예 2027년 상상인 신춘문예 공모 258 주최 . 상상인',
  '3. 제30회 우암전국백일장',
  '3. 제2회 블루카이트 창작 글쓰기 대회',
  '9. 충남이라 누리는 정책체험 생활수기 공모전',
  '사진•영상•영화제 2026 양주 나리농원 숏폼 영상 공모전 2 주최 . 양주시',
  '5. 2026 농어촌 기본소득 숏폼 공모전_10월',
  '미술•디자인•웹툰 2026 레진성인공모전 0 주최 . 주식회사 레진엔터테인먼트',
  '6. 2026 세계아동그림대회',
  '8. 2026 제24회 joinhand 청소년가요제',
  '요리•뷰티•배우•오디션 뮤지컬 한글용사 아이야 배우 오디션 0 주최 . DS뮤지컬컴퍼니',
  '2. 제16차 한-카리브 고위급 포럼 서포터즈',
  '2026 뉴뉴스 프리랜서 기자 모집',
  '3. 자바 풀스택 & 생성형AI 서비스개발 기업 프로젝트 완성 과정 7기 훈련생 모집',
  '9. 글로벌 크루즈 채용설명회',
  '6. 용인어린이상상의숲 상상 아트마켓 참여 예술가 공모',
]) check('contestKorea', text, false);

// K-Startup: 모두의 창업 and English-titled programs were dropped before.
for (const text of [
  '2026년 프로젝트 창업 인큐베이팅 : 2027 모두의 창업 선정 프로젝트',
  'Applications Now Open: 2026 OASIS-6 Global Startup Challenge 「2026 외국인 창업대전(OASIS-6)」 참가자 모집',
  '용인시산업진흥원 2026년 제4차 창업지원센터 입주기업 모집 오늘마감',
  '「2026 슈퍼:콘 엑셀러레이팅」 지원사업 참여기업 모집공고',
  '「청년창업기업·사회적경제기업·예비창업자(소상공인) 대상」 2025년 제1기 서울콜라보레이션 청년 성공창업스쿨 교육생 모집 오늘마감',
]) check('kStartupHighlights', text, true);
check('kStartupHighlights', '2026년 광명 글로컬 데모데이 참관객 모집', false);

// Grantly: region tags and "기업 모집" wording are conditions, not exclusions.
for (const text of [
  '[경남] 2026년 바이오메디컬 AI 상용화 기반구축 기업지원 모집 공고',
  '2026년 스타트업 법률지원사업 대전광역시 법률상담회 참여 기업 모집 안내',
  '2026년 10월 전북 IR피칭 & 오피스아워 by KRYPTON 신청 접수',
  '2026년 10월 동네창업학교 교육생 모집 공고',
]) check('grantlySupport', text, true);
for (const text of [
  '[경북] 예천군 2026년 3차 소규모 사업장 방지시설 설치 지원사업 공고',
  '2027년 1차 방산전시회 참가 지원사업 참여기업 모집 공고',
  '2026 광명시 기업박람회(GM TECH EXPO 2026) 참여기업 추가모집 공고',
  '[전북] 해외전시회 베트남 달랏 웰니스 페스타 참여기업 모집 공고',
  '2026년 전자문서 유공 포상 계획 연장 공고',
]) check('grantlySupport', text, false);

// 소통24: public idea/proposal contests only.
check('sotong24Contests', '[2026-10-01 00:00 ~ 2026-10-31 23:59] 【감사원】 국민제안 감사 아이디어 공모 감사원', true);
check('sotong24Contests', '[2026-10-01 09:00 ~ 2026-10-30 18:00] 【행정안전부】 2026 모바일신분증 아이디어 공모전 행정안전부', true);
check('sotong24Contests', '[2026-10-01 09:00 ~ 2026-10-31 18:00] 【행정안전부】 CCTV 영상 데이터 활용 AI 아이디어 공모전', true);
check('sotong24Contests', '[2026-10-01 09:00 ~ 2026-10-31 18:00] 【국민권익위원회】 정책 제안 공모 접수기간 안내', true);
check('sotong24Contests', '[2026-10-01 09:00 ~ 2026-10-14 23:59] 【서울특별시】 제3회 서울특별시 강서구 캐릭터 새로미 굿즈 공모전(연장)', false);
check('sotong24Contests', '[2026-10-01 00:00 ~ 2026-11-10 17:00] 【서울특별시】 제12회 서울 29초 영화제 서울특별시', false);
check('sotong24Contests', '[2026-10-01 09:00 ~ 2026-10-31 18:00] 【해양경찰청】 소형레저기구 표류사고 예방 퀴즈 이벤트', false);

// Unchanged sources keep their previous behaviour.
check('dakerHackathons', '프리미엄 2026 해커톤 총 상금 참가 신청하기', true);
check('dakerHackathons', '종료 2026 해커톤', false);
check('hackathonKorea', '5일 후 Seoul 11 한국젠스파크AI연구회 10월18일 젠스파크AI 해커톤', true);
check('hackathonKorea', '종료 Team.Human [AI IMPACT] AI FOR GOOD 해커톤', false);

console.log('PASS: crawler actionability follows the collection scope');
