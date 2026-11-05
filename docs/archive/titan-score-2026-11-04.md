# Titan Web GPT 공모전 채점 (2026-11-04)

목표: Titan을 "넓은 검색" 담당으로 넣을지 정하기 위해, Web GPT가 한국 공모전을 얼마나 찾아오는지 잰다.

## 1~3차 종합

세 번 합쳐 정답 19건 중 12건을 찾았고, 정답 밖 공식 확인 공고는 33건이다. 2차는 22분 55초가 걸렸는데 정답은 3건만 늘었고, 1차의 공식 확인 22건 중 8건을 놓쳤다. 3차는 아는 사이트를 빼고 9분 57초에 새 공식 확인 6건을 더했다. 자세한 내용은 아래 "2차", "3차" 절에 있다.

## 1차 결과 요약

| 항목 | 값 |
|---|---|
| Web GPT가 낸 공고 | 35건 |
| 정답 19건 중 찾은 수 | **8건** (42%) |
| 정답 밖 새 공고 | **27건** |
| 그중 공식 페이지에서 접수 중 확인 | **22건** |
| 포털에서만 접수 중 확인 | 3건 |
| 공식 공고는 있으나 마감일 미확인 | 1건 |
| 확인 불가 | 1건 |
| 걸린 시간 | 2분 35초 (22:14:59 지시 → 22:17:34 답변 끝) |
| 링크 재요청 | 약 36초 추가 (22:18:34 → 22:19:10) |
| 검색 규모 | 화면 표시 기준 웹사이트 53개 |

기준과 비교: 현재 브리핑은 정답 19건 중 4건을 담고 있다(`docs/system/findings.md`). 이번 1회 실행은 8건을 찾았다.

종합: Web GPT는 정답 목록의 절반 이상을 놓쳤지만, 정답 밖에서 공식 확인된 공고를 22건 더 가져왔다. 정답 8건과 합치면 실제 쓸 수 있는 공고가 30건이다.

## 실행 방식과 한계

- 실행은 **worker가 아니라 일반 Web GPT 채팅**이다. `workers_spawn` 2회가 시작도 못 하고 실패해서, 사용자 지시로 네이버 프로젝트와 같은 `/v1/sessions/open` 경로를 썼다. 지시문의 찾기·범위 부분은 worker 지시와 같다.
- 달라진 지시 한 곳: 결과를 파일 대신 답변에 적고, worker를 띄우지 말고 직접 찾으라고 했다. 정답 목록은 주지 않았다.
- 1회 실행이다. 같은 지시를 다시 돌렸을 때 결과가 같은지는 모른다.
- 공식 링크는 첫 답변 기록에 남지 않아서 같은 채팅에 평문으로 다시 받았다. 표 형식만 바꾼 요청이고 새 검색은 금지했다.
- 놓친 11건이 오늘도 접수 중인지는 다시 확인하지 않았다. 정답 목록을 그대로 썼다.
- Web GPT가 적은 마감일은 새 공고 27건만 대조했다. 정답과 겹친 8건은 대조하지 않았다.

## worker가 실패한 이유

- 원인: Claude가 부르는 외부 prime 경로가 Titan 내장 브라우저에 묶여 있는데, 앱은 크롬을 쓰고 내장 브라우저는 꺼져 있다.
- 설정 근거: Titan `config.json`의 `externalPrime.principals[0].browserBinding.kind=cos`, `ui.chatBrowser=chrome`.
- 코드 근거: `D:\Dev\Titan\src\main\bridge-custody.ts`의 `commandMatchesCompanion`은 묶인 브라우저 종류·ID가 맞아야 명령을 내준다. `bridge-delivery.ts`의 `deliverOne` 주석대로 다른 브라우저를 대신 고르지 않는다.
- 기록 근거: `app.log` 13:03:07~13:04:37(worker-1), 13:08:19~13:09:49(worker-2). 둘 다 `no browser opened it; no redeem reached the handler`로 끝났다. 같은 시각 크롬 확장은 연결돼 있었다(12:57:42).
- 대조: 같은 날 11:27 ChatGPT Prime이 만든 worker는 4초 만에 시작했다. 이 경로는 바인딩을 쓰지 않는다.
- 처리: 실패 보고 2건은 수거해 ACK했다. 바인딩은 사용자 설정이라 바꾸지 않았다.

## 정답 19건 대조

| 정답 | 찾음 | 답변 번호 |
|---|---|---|
| 2026 DATA·AI 분석 경진대회 | O | 5 |
| 대경권 캠퍼스 IR 챔피언십 | X | |
| 한국체육산업개발 공공데이터 활용 경진대회 | X | |
| AI 달인의 꿀팁 챌린지 시즌4 | X | |
| 성평등 AI 벤치마크 챌린지 | O | 25 |
| LOTTE AX CHALLENGE 2026 | O | 1 |
| 햇반 30주년 AI 공모전 | X | |
| 현대자동차그룹 차량용 앱 개발 공모전 | O | 21 |
| AI 플레이 콘텐츠 제작 공모전 | X | |
| 조달청 AI 게임·콘텐츠 공모전 | X | |
| 2026 스페이스 해커톤 | O | 3 |
| Nitto Open Innovation Challenge | O | 32 |
| KEIT 대국민 혁신 아이디어 공모전 | X | |
| 메치니코프 신제품 공모전 | X | |
| 홍제천 상상더하기 공모전 | X | |
| 스마트시티(지식서비스산업) 아이디어 경진대회 | X | |
| 대국민 재정교육 아이디어 공모전 | O | 30 |
| AI 활용 전국 대학생 창업 해커톤 | O | 12 |
| 해양 창업아이디어 공모전 Spark-up 1876 | X | |

## 새 공고 27건 확인

공식 페이지에는 주최기관 사이트 외에 주최가 쓰는 접수·운영 페이지(온오프믹스, DAKER, Blaybus)와 정부 공고 게시판(기업마당)을 포함했다.

### 공식 페이지에서 접수 중 확인: 22건

| 번호 | 공모전 | 확인한 마감 | 확인한 곳 |
|---|---|---|---|
| 4 | 2026 HF 대국민 혁신 아이디어 공모전 | 11/06 | [한국주택금융공사](https://www.hf.go.kr/ko/sub04/sub04_05_02.do?articleNo=600648&mode=view) |
| 6 | 2026 서울AI디지털배움터 청년 AI 해커톤 | 11/08 23:59 | [온오프믹스](https://onoffmix.com/event/351544) |
| 7 | 청년 어촌 창업 아이디어 공모전 | 11/08 | [공식 사이트](https://co-vill.imweb.me/) |
| 8 | NIA 탄소중립 혁신 아이디어 공모전 | 11/08 | [NIA](https://www.nia.or.kr/site/nia_kor/ex/bbs/View.do?bcIdx=30083&cbIdx=99835&parentSeq=30083) |
| 9 | 6G 대표 서비스 시나리오 발굴 공모전 | 11/08 | [기업마당](https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000127281) |
| 10 | 2026 K-AWARDS 학생부 공모전 | 11/09 | [공식 사이트](https://www.kwaa.or.kr/K-awards2026/) |
| 14 | 2026 의왕시 청년 e-Room 창업 아이디어 공모전 | 11/11 18:00 | [온오프믹스](https://onoffmix.com/event/351580) |
| 15 | 2026년 공공 AI 대전환 챌린지 | 11/11 | [행안부 자료(KDI 게재)](https://eiec.kdi.re.kr/policy/materialView.do?num=288372) |
| 17 | 과기부 × 엘리스 AI 챌린지 | 11/13 | [공식 사이트](https://ai-challenge.elice.page/home/main) |
| 18 | 소재연구데이터·AI 활용 해커톤 | 11/13 12:00 | [DAKER](https://daker.ai/public/hackathons/2026-materials-ai-hackathon) |
| 19 | 국가생명윤리정책원 ESG 대국민 아이디어 공모전 | 11/13 24:00 | [공지·포스터](https://nibp.kr/board/notice/post?ntcOid=20000063) |
| 22 | 소상공인 정책 아이디어 공모전 | 11/16 | [공식 사이트](https://www.gcgfcontest.co.kr/info.asp) |
| 23 | 2026 현장문제 AX 업무혁신 아이디어 해커톤 | 11/17 23:59 | [Blaybus](https://www.blaybus.com/program/1148/landing) |
| 24 | 서울시 행정서식 개선 아이디어 공모전 | 11/20 23:59 | [내 손안에 서울](https://mediahub.seoul.go.kr/gongmo/2000785) |
| 26 | 사회보장 데이터 AI 혁신 아이디어 경진대회 | 11/20 | [한국사회보장정보원](https://www.ssis.or.kr/lay1/bbs/S1T1910C1976/B/101/view.do?article_seq=130235) |
| 27 | 제주시 정책 아이디어 공모전 3차 | 11/20 18:00 | [제주시](https://www.jejusi.go.kr/citizen/cnte.do?mode=detail&cnte_uuid=4e96c5844fe1449dab9d5e9ff88672b5) |
| 28 | 남양주시 규제개선 아이디어 공모전 | 11/20 | [남양주시](https://nyj.go.kr/www/selectBbsNttView.do?bbsNo=31&key=2367&nttNo=549964) |
| 29 | 체육관련 규제개선 대국민 아이디어 공모전 | 11/22 | [국민체육진흥공단](https://www.kspo.or.kr/kspo/bbs/B0000027/view.do?menuNo=200149&nttId=64358) |
| 31 | 제1회 하나증권 청년 금융 아이디어 공모전 | 11/30 17:00 | [공식 사이트](https://bit.ly/hanaw-contest-edm) |
| 33 | 구리시 청년내일센터 창업아이디어 경진대회 | 11/05 23:59 | [온오프믹스](https://www.onoffmix.com/event/351074) |
| 34 | 금융권 장애인 고용 JOB아라 아이디어 챌린지 | 11/08 | [공식 사이트](https://www.financeidea.co.kr/mobile/info.asp) |
| 35 | 대전 시민 생활·관계 개선 아이디어 공모전 | 11/13 18:00 | [사회혁신센터](https://commonz042.kr/bbs/board.php?bo_table=public_apply&wr_id=57) |

### 포털에서만 접수 중 확인: 3건

| 번호 | 공모전 | 포털 표시 | 공식 확인이 안 된 이유 |
|---|---|---|---|
| 2 | 서울시립대 AI+X 실전 문제해결 프로젝트 2기 | [공모전헌터](https://app.gonghunt.com/contests?types=hackathon) 11/04 | 검색으로 주최 공고를 못 찾음 |
| 13 | 보령시 웰니스 정책 제안 공모전 | [지콘테스트](https://gcontest.co.kr/front/m/comp/view/38038) 11/11 | 검색으로 보령시 공고를 못 찾음 |
| 20 | 2026 Soul Mate Pioneers 창업경진대회 | [씽유](https://thinkyou.co.kr/mobile/contest/67834/) 11/15 | 접수처가 구글 폼이고 로그인을 요구해 못 열었음 |

### 마감일 미확인: 1건

- 11번 KIMST ESG경영·혁신 아이디어 공모전: [공식 공지](https://www.kimst.re.kr/u/news/notice_01/board.do?bno=153421765145962&type=view)는 10월 20일에 올라왔다. 마감일은 첨부 공고문에 있고 첨부를 내려받지 않아, Web GPT가 적은 11/09는 확인하지 못했다.

### 확인 불가: 1건

- 16번 한림대 졸업생 특화 프로그램 아이디어 공모전: 받은 링크가 [씽유 분야 목록](https://thinkyou.co.kr/contest/idea.asp)이고 그 안에서 공고를 찾지 못했다. 웹 검색으로도 나오지 않았다.

## 범위 메모

- 15번(공무원·공공기관 직원 전용)과 34번(금융권 임직원 전용)은 일반인이 낼 수 없다. 범위 규칙은 참가 조건을 표시하고 제외하지 말라는 것이라 새 공고 수에 넣었다.
- 10번 K-AWARDS는 "AI 디지털 작품 공모"라 부문에 따라 디자인 제외 규칙에 걸릴 수 있다. 부문별로 가르지는 않았다.

## 2차: 출처를 지정하고 worker 2개로 재측정

사용자 지시: 목표 건수는 넣지 않고 worker 2개를 쓴다. 정답 제목은 지시문에 넣지 않았다. 지시문 전문은 `artifacts/titan-score-2026-11-04/round2-text.txt`.

- worker-1: 위비티·씽유·콘테스트코리아·링커리어·올콘·공모전헌터 목록을 직접 순회
- worker-2: 기업마당·K-Startup·공공기관·지자체·대학·기업·개발 대회 플랫폼을 직접 탐색
- 이번에는 ChatGPT Prime이 만든 worker라 외부 prime 바인딩 영향을 받지 않았고, 2개 모두 정상 시작했다.

| 항목 | 1차 (채팅 1개, 지정 없음) | 2차 (worker 2개, 출처 지정) |
|---|---|---|
| 낸 공고 | 35건 | 36건 |
| 정답 19건 중 찾은 수 | 8건 | **11건** |
| 정답 찾음 중 공식 확인까지 된 수 | 대조 안 함 | 7건 (나머지 4건은 포털·목록 수준) |
| 걸린 시간 | 2분 35초 | 약 22분 55초 |
| 마감일을 낸 공고 | 35건 | 24건 (12건은 미확인 후보) |

시간 내역: 22:25:56 지시, worker-2 3분 19초(22:27:36~22:30:55), worker-1 17분 51초(22:27:37~22:45:28), Prime 합치기 22:47:10~22:48:51.

### 위비티 지정의 영향

정답지 출처인 위비티를 지시문에 넣었으므로, 정답 8건 → 11건 상승을 순수한 능력 향상으로 볼 수 없다. 늘어난 4건(대경권 IR, 한국체육산업개발, 조달청, KEIT)은 모두 worker-1이 포털에서 찾았다. 반대로 1차가 찾은 재정교육 공모전은 2차에서 빠졌다.

### 지정 때문에 좁아졌나

1차에서 공식 확인된 22건 중 2차가 다시 찾은 것은 **14건**이다. 8건은 빠졌다.

- 다시 찾음: HF, 서울AI, 어촌, NIA, 6G, K-AWARDS, 의왕, 엘리스, 소재연구, AX 해커톤, 서울 행정서식, 사회보장, 체육 규제, 구리
- 빠짐: 공공 AI 대전환, 생명윤리, 소상공인, 제주시, 남양주시, 하나증권, JOB아라, 대전 시민 공모

1차의 자유 검색이 찾은 공고의 약 3분의 1을 지정 실행이 놓쳤다. 두 실행은 대체 관계가 아니다.

### 2차에서 처음 나온 공고 10건

| 답변 번호 | 공모전 | 확인 결과 | 확인한 곳 |
|---|---|---|---|
| 10 | 국부펀드 KIC AI 에이전트 공모전 | 공식 확인, 11/12 10:00 | [DAKER](https://daker.ai/public/hackathons/kic-ai-agent-competition) |
| 19 | 제주 AI·빅데이터 AI Agent 개발 챌린지 | 공식 확인, 11/20 10:00 | [DAKER](https://daker.ai/public/hackathons/jeju-ai-bigdata-agent-challenge) |
| 25 | 한국도로공사 AI 활용 아이디어 공모전 | 공식 확인, 11/15 | [모두의 광장](https://sotong.go.kr/front/epilogue/epilogueNewViewPage.do?menu_id=527&bbs_id=a80de8d7090348d689cffb81b055a62d&pagetype=bbs) |
| 32 | 대구 기후·환경·탄소중립 공공데이터 AI 활용대회 | 공식 확인, 11/20 17:00 | [탄소중립지원센터](https://dcnc.or.kr/bbs/board.php?bo_table=notice&wr_id=193) |
| 18 | 산림공공데이터 활용 사례 공모 | 포털만, 11/20 | [콘테스트코리아](https://www.contestkorea.com/sub/view.php?int_gbn=1&Txt_bcode=031410001&str_no=202611040027) |
| 28 | 부여 솔버톤 대회 | 포털만, 11/11 | [콘테스트코리아](https://www.contestkorea.com/sub/view.php?int_gbn=1&Txt_bcode=031410001&str_no=202610260036) |
| 30 | 제2회 Tech-GPT 서비스 경진대회 | 포털만, 11/06 | [링커리어](https://linkareer.com/activity/361063) |
| 33 | 구름톤 아레나 2026 | 포털 마감 11/06, 공식 페이지는 신청 버튼만 확인, 참가비 있음 | [공식](https://9oormthon.goorm.io/arena/) |
| 34 | 제1회 한아전 게임 시나리오·그래픽 공모전 | 포털만, 11/30. 문학·디자인 제외 규칙에 걸릴 수 있음 | [위비티](https://www.wevity.com/?c=find&s=1&mode=ing&gub=1&cidx=21&gbn=view&gp=1&ix=110305) |
| 36 | 모두의 아이디어 지정공모 기업부문 | 확인 불가, 링크 없음 | 없음 |

공식 확인 4건, 포털만 5건, 확인 불가 1건이다.

### 1·2차 합계

- 두 실행의 고유 공고: 45건 (1차 35건 + 2차 신규 10건)
- 합쳐서 찾은 정답: **12건 / 19건**
- 아직 못 찾은 정답 7건: AI 달인의 꿀팁 시즌4, 햇반 30주년, AI 플레이 콘텐츠, 메치니코프, 홍제천, 스마트시티, Spark-up 1876
- 공식 확인 공고: 정답 밖 26건 (1차 22건 + 2차 4건). 정답과 겹친 공고는 이 수에 넣지 않았다.

### 2차에서 드러난 것

- worker-1은 공모전헌터 목록 17개를 봤다고 보고했지만 일부만 적고 "등"으로 줄였다. 그 목록 페이지를 직접 열어 보니 정답인 "AI 플레이 콘텐츠 제작 공모전"이 있었다. 찾고도 보고에서 빠진 셈이다. 같은 목록의 PayPal AI Hackathon, Meta VR Start Developer Competition, Hecto AI Challenge, AI 헬스케어 미니 데이터 챌린지도 빠졌다.
- worker-1은 실제 브라우저 도구를 140회 넘게 썼고 18분 걸렸지만, 콘테스트코리아·링커리어·올콘(접수 중 180건)은 끝 페이지까지 못 갔다. 보고에도 그렇게 적혀 있다.
- worker-2의 도구 기록은 Titan `agents` 5회뿐이고 화면 표시는 "웹사이트 N개 검색함"이다. ChatGPT 내장 웹 검색으로 일한 것으로 보이며, 보고의 "직접 열람"이 실제로 어느 수준인지는 기록으로 확인하지 못했다(추정).
- 공모전헌터의 스페이스 해커톤 마감 표기(23:59)는 공식(18:00)과 달랐다. worker-1이 공식 페이지로 잡아냈다. 포털만 믿으면 안 된다는 사례다.
- 1차 답변은 출처 지정이 없었는데도 공바지·Essay 공모전 목록을 대조했다고 적었다. 2차 지시문에는 없는 경로다.

### 2차 실행 중 사고

- 두 worker가 끝났는데 Prime이 합치는 턴을 시작하지 않았다. 22:46:38에 Prime 탭이 닫혔다는 기록이 있고, 누가 닫았는지는 로그에 없어 추적 불가다. 22:47:10에 제가 합치라는 메시지를 보내 진행했다.
- 그 메시지를 받은 Prime은 worker 보고만 합치고 새 검색은 하지 않았다. 지시대로다.
- Titan 저장 경고 `Global session asset quota exceeded`가 같은 세션에서 떴다. 최종 답변은 `truncated=false`로 잘리지 않았다.

### ACK

2차 worker는 Claude가 아니라 ChatGPT Prime이 만들어서 Claude 쪽 ACK 대상이 아니다. 결과는 Titan 세션 기록에서 수거했다.

## 3차: 아는 사이트를 빼고 자유 탐색

사용자 지시로 재측정했다. 일반 채팅 1개에 이미 아는 목록 사이트 15곳을 출처에서 빼라고 했다. 지시문 전문은 `titan-score-2026-11-04-raw/round3-prompt.txt`.

| 항목 | 1차 (지정 없음) | 2차 (worker 2개, 지정) | 3차 (아는 곳 제외) |
|---|---|---|---|
| 낸 공고 | 35건 | 36건 | 20건 |
| 앞 실행에 없던 새 공고 | 정답 밖 27건 | 10건 | **10건** |
| 그중 공식 접수 중 확인 | 22건 | 4건 | **6건** |
| 정답 19건 중 | 8건 | 11건 | 3건 (전부 이미 찾은 것) |
| 걸린 시간 | 2분 35초 | 약 22분 55초 | 9분 57초 |

3차는 정답지를 늘리지 못했다. 정답 대부분이 위비티에 있으니 위비티를 뺀 3차에서 낮은 것은 당연하다. 3차의 값은 포털이 놓친 곳을 찾느냐이고, 공식 확인 6건이 그 답이다.

### 3차 새 공고 10건

| 답변 번호 | 공모전 | 확인 결과 | 확인한 곳 |
|---|---|---|---|
| 2 | 2026 양천구 아이디어 공모전 | 공식 확인, 11/06 | [양천구](https://yangcheon.newstool.co.kr/view.php?aid=18436&eid=9061) |
| 3 | CG&I × KAIST XR·AI 윈터스쿨·해커톤 | 공식 확인, 11/06 | [KAIST ARRC](https://arrc.kaist.ac.kr/ko/news/winter-school-2026) |
| 6 | 2026 KDN Eco-Life 환경 공모전 (아이디어 부문) | 공식 확인, 11/10 | [한전KDN](https://www.kdn.com/event.kdn?mid=a10111060100&act=view&event_seq=59&event_status=I) |
| 13 | 2026 완도군 지방소멸 대응 아이디어 공모전 | 공식 확인, 11/18 | [국민생각함](https://www.epeople.go.kr/cmmn/idea/redirect.do?ideaRegNo=1AE-2610-0000990) |
| 14 | 용산국제업무지구 AI 스마트도시 아이디어 공모 | 공식 확인, 11/20 17:00 | [프로젝트서울](https://project.seoul.go.kr/view/viewDetailCptt.do?cpttMstSeq=737) |
| 18 | 2026 AI 서비스 기획 공모전 | 공식 확인, 11/30. 교육과정 모집과 연계된 공모 | [KPII](https://idea2026.kpii.or.kr/) |
| 8 | GEEKs IDEATHON 2026 | 공식 사이트 있음, 행사 11/14, 신청 마감 미확인, 참가비 있음 | [GEEKs](https://www.geeks.kr/) |
| 12 | 2026 경상북도 도민 대상 규제개선 공모전 | 공고 11/02 게시 확인, 답변의 11/16 미확인 | [경상북도](https://www.gb.go.kr/page/10102/10000.do) |
| 19 | 상주시 대표축제 대국민 아이디어 공모전 | 접수 양식은 열림, 답변의 2027-01-15 미확인. 요강 페이지에 다른 공모전 내용이 들어 있음 | [공식 사이트](https://sangjufestival.com/bbs/page.php?gr_id=G_02&hid=contest) |
| 5 | 2026 다시, 다리다 유휴공간 활성화 아이디어 공모전 | 포털만, 공식 링크 없음 | [링커리어](https://linkareer.com/activity/360396) |

공식 확인 6건, 공식 있으나 마감 미확인 3건, 포털만 1건이다. 1차에서 포털로만 확인한 보령시 공모전은 3차가 [보령시 공고](https://www.brcn.go.kr/prog/eminwon/kor/BB/sub04_03_01/view.do?mgtno=57363)를 찾아 공식 확인(11/11)으로 올라갔다.

### 3차가 알려 준 목록 페이지 8곳

경상북도 알림마당, 프로젝트서울, 모두의 AI 경진대회, KAIST ARRC 소식, 연세대 창업지원단, 기획예산처 보도자료, 열린재정 공지사항, 국립연명의료관리기관 공지. 주소는 `round3-final.md`에 있다. 크롤러 후보에 넣을 가치는 재 보지 않았고, 등록도 하지 않았다.

### 1~3차 합계

- 고유 공고: 55건
- 찾은 정답: 12건 / 19건 (3차로 늘지 않음)
- 정답 밖 공식 확인: 33건 (1차 22 + 2차 4 + 3차 6 + 보령 1)
- 세 실행 모두 1회씩이라 재현성은 모른다.

## 원본 위치

- 지시문과 답변 복사본: `docs/archive/titan-score-2026-11-04-raw/`
- 1차 답변 전문: `artifacts/titan-score-2026-11-04/worker-report.md`, 링크: `worker-links.txt` (Git 제외 폴더)
- 2차 지시문·최종 답변·worker 보고: 같은 폴더의 `round2-text.txt`, `round2-final.md`, `round2-worker-1.md`, `round2-worker-2.md`
- 3차 Titan 세션 `ebcb12d9-3042-4903-a9c1-dec095dfd783`, ChatGPT 대화 `6aeb39bd-b45c-83ec-8042-c5d8d33a0706`
- 1차 Titan 세션 `967029e7-4fc3-4f44-a6db-a397dee6edd1`, ChatGPT 대화 `6aeb2fd6-c824-83ec-9b68-10cdd1ab0ef6`
- 2차 Titan 세션 `a1dd5975-4713-4834-9690-a6fb5eaa514d`, Prime 대화 `6aeb326b-e9b8-83ee-8cec-270e5c4b44d5`, worker 대화 `6aeb32c6-f490-83ee-8f65-75df3ccf8b06`, `6aeb32c7-0f64-83e8-8566-37b0ebf41707`
- 실패 worker family `4e50c60c-7935-4e6d-84b5-77c2896bd437`, 보고 수거본은 같은 폴더의 `task-results/`
