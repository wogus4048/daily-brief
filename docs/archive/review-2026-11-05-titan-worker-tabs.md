# Titan 변경 냉정 리뷰: worker 탭 정리 (2026-11-05)

대상: `D:\Dev\Titan-worker-tab-cleanup`, 브랜치 `feat/worker-tab-cleanup-20261105`, 커밋 `8547ae13` (`git diff HEAD~1`).
방법: 원본 코드 읽기와 변경 파일 테스트 실행(`worker-tab-cleanup`, `browser-control-created-tabs`, `mcp`, `log-identity`). 앱 빌드·설치·실행 중인 Titan은 건드리지 않았고 코드는 고치지 않았다.
등급: 기록(원본 자료), 코드(파일·줄을 읽음), 추정.

## 목표 줄
1. 사용자 결정: worker의 채팅 탭이 닫힐 때 그 worker가 연 탭을 닫는다.
2. 사용자 지시: "탭정리 반드시구현해".
3. 사용자가 직접 연 탭, Prime의 탭, 다른 worker의 탭은 닫으면 안 된다. 잠들었다가 깨어날 worker의 채팅이 살아 있으면 닫으면 안 된다.
4. 이 Titan 위에서 도는 네이버 자동화(Prime과 worker 다수)를 깨면 안 된다.

## 먼저 한 줄 결론
남의 탭을 닫는 직접 경로(owner 문자열 위조, Prime 탭, 다른 worker 탭)는 코드에서 찾지 못했다. 다만 (A) worker가 finish로 잠들 때마다 탭이 닫히는 동작은 작성자 설명("Finish는 아무것도 닫지 않는다")과 다르고 목표 3의 해석에 걸린다. (B)(C)는 사람·Prime이 worker 탭을 이어받는 구멍이고, (D)는 close-all 때 브로커 한도를 같이 쓰는 문제다.

---

## 깨지는 목표가 있는 발견

### A. worker가 finish로 잠들면 곧바로 그 worker의 탭이 전부 닫힌다 (작성자 설명과 다름) - 목표 3 (해석에 따라), 4
- 무슨 일: 작성자는 "Finish is sleep and closes nothing by itself"(`docs/cos-architecture.md` 변경분)라고 쓴다. 그러나 탭 정책은 "완료 결과를 보고하고 잠든 worker"의 채팅 페이지를 **즉시** 닫는다(`src/main/bridge-tabs.ts:167` `stoppedWorkerPages`, 같은 파일 설명 주석 "Durably stopped worker pages instead close immediately"; 조건 `src/main/agents-prime.ts:603-610` `hasReportedSleepingResult`). 확장은 이 닫음을 `byExtension: true`로 `/closed`에 보고하고(`extension/background.js:5237-5240`, manual=false), `routeClosed`는 `queueMissingTab`을 부른다. 잠든 worker는 슬롯이 working이 아니라서 `bridge-delivery.ts:96-97`에서 "not working"으로 거절되어 `false`가 돌아오고, 그 결과 `closeWorkerTabs`가 실행된다(`bridge-routes-activity.ts:461-467`). `departedWorkerOwner`는 `agent.state === 'waking'`만 제외하고 `sleeping`은 제외하지 않는다(`worker-tab-cleanup.ts:33`). 작성자 자신의 테스트가 이를 확인한다: `test/worker-tab-cleanup.test.ts:108-115` "asks for them when maintenance closes a reported sleeping worker's page". 테스트 `:117-124`("worker가 잠들기만 하고 채팅 탭이 열려 있으면 안 닫는다")는 탭 정책이 페이지를 닫기 **전** 순간만 본다.
- 결과: 일을 마친 worker가 열었던 탭(산출물 페이지, 로그인된 네이버 화면 등)이 finish 직후 사라진다. 나중에 사용자가 그 worker에게 메시지를 보내 깨우면 worker는 자기 탭이 없다. Prime이 worker 산출물 탭을 `browser_snapshot`으로 검토하려 해도 이미 없다. 모델용 지침(`mcp/instructions.ts:39`)에는 "chat tab이 닫히면 닫힌다"라고만 쓰여 있어 모델은 finish가 곧 chat tab 닫힘임을 모른다.
- 등급: 코드(위 줄들) + 작성자 테스트. 실제 네이버 작업에서 worker가 finish 후 탭을 다시 쓰는지는 모름(확인 방법: 네이버 자동화의 worker 지시문과 최근 로그에서 finish 뒤 같은 worker 재호출 여부).
- 깨지는 목표: 3(잠들었다가 깨어날 worker의 탭을 잃음, 해석에 따라), 4(네이버 worker가 재사용하는 탭이 있으면). 사용자 결정 1은 글자 그대로는 충족.
- 고치는 방법(사용자 답에 따라):
  - 의도한 동작이면: 코드는 두고 `docs/cos-architecture.md`의 "finish closes nothing" 문장과 `instructions.ts`를 "worker가 finish하면 곧 chat tab이 닫히고 이때 탭도 닫힌다"로 고친다.
  - 의도가 아니면: `departedWorkerOwner`(`worker-tab-cleanup.ts:33`)에서 `agent?.state === 'sleeping'`이면 null을 돌려준다(한 줄). 그러면 사람이 직접 닫은 경우(`manual`), close-all, 종료·퇴역(`finished`)에서만 정리된다. 이때 잠든 채 끝내 안 깨어나는 worker의 탭은 새지만 그것은 변경 전 상태와 같다.

### B. 사람이 보고 있는 worker 탭도 닫는다 - 목표 3
- 무슨 일: `keepCreated`는 pinned, 비 HTTP(S), protected, chat 탭, 다른 소유자 attach만 거른다(`extension/browser-control.js:259-267`). 활성 탭인지(`tab.active`), 소리 나는지(`tab.audible`), 생성 후 다른 사이트로 옮겨 갔는지는 보지 않는다. 사용자가 worker가 연 탭을 클릭해 쓰고 있어도(생성 때는 `active:false`였을 뿐 이후 사람이 바꾼다) worker 채팅이 닫히면 그 탭이 사라진다. 사용자가 그 탭에 입력 중이던 내용도 잃는다.
- 등급: 코드(줄). 실제로 사람이 worker 탭을 쓰는 빈도는 모름(추정).
- 깨지는 목표: 3("사용자가 직접 연 탭" 자체는 안 닫지만 넘겨받은 탭은 닫음).
- 고치는 방법: `keepCreated`에 `if (tab.active) return 'active'`를 추가한다(생성 시 `active:false`로 열므로 active는 사람이 선택했다는 뜻이다). 탭이 속한 창이 백그라운드 창이면 active가 true일 수 있으니 `chrome.windows.get(tab.windowId).focused`까지 보는 쪽이 더 정확하다. `audible`도 같이 거른다. 테스트 한 건 추가.

### C. Prime(또는 다른 소유자)이 worker 탭을 attach했다 풀면 기록이 남아 닫힌다 - 목표 3
- 무슨 일: `attach()`는 이미 붙어 있는 소유자만 검사하고(`extension/browser-control.js:222-223`) 생성 기록 `created`의 소유자는 바꾸지 않는다. `closeCreated`가 기록을 지우는 경우는 닫는 시점에 다른 소유자가 **붙어 있을 때뿐**이다(`:261`, `:288-290`, 테스트 `browser-control-created-tabs.test.ts:176`). Prime이 worker 탭을 attach해서 쓰다가 release하면(release는 탭을 열어 둔다) 기록은 worker 소유로 남아 worker 채팅이 닫힐 때 같이 닫힌다. Prime이 attach 없이 `browser_snapshot`만으로 읽는 경우(지침이 권장)도 기록에 영향이 없다. 이 경우는 A와 겹친다.
- 등급: 코드(줄). 실제 Prime이 worker 탭을 attach하는지는 모름.
- 깨지는 목표: 3(Prime이 이어받은 탭).
- 고치는 방법: `attach()`에서 `created.get(tabId)`가 있고 `!owns(record, command)`이면 `created.delete(tabId)`(한 줄). 단, snapshot-only 읽기는 소유권 주장이 아니므로 막을 방법이 없고 A의 결정에 맡긴다.

### D. close-all 때 worker마다 브로커 명령을 하나씩, 제한 없이 쏜다 - 목표 4
- 무슨 일: 닫히는 worker 채팅 하나마다 `closeWorkerTabs`가 따로 돌고(`bridge-routes-activity.ts:467`) 각자 연결된 모든 브라우저에 `browserControl.execute`를 `Promise.all`로 낸다(`worker-tab-cleanup.ts:46-47`). 순서 제어도 대기열도 없다. `BROWSER_LIMITS.pending`은 32이고 Prime·worker의 일반 `browser_*` 호출과 같이 쓴다(`src/shared/browser-control.ts:9`, `browser-control.ts:94`). 탭을 하나도 안 만든 worker도 명령 하나를 쓴다. 확장은 요청을 **직렬**로 처리하므로(`extension/browser-control.js:711` `for` 루프) 정리 명령이 몰리면 그 뒤에 Prime의 `browser_*` 호출이 줄을 선다. 정리 쪽 실패(BUSY, 25초 초과)는 2/10/30초 재시도로 가려지지만, 그 사이 다른 호출이 `BROWSER_BUSY: ... no operation was dispatched`를 받을 수 있다.
- 등급: 코드(한도·직렬 처리). 몇 편이 동시에 닫혀야 실제로 걸리는지, 지연이 얼마인지는 측정 안 함(추정). 확인 방법: `POST /v1/tabs/close-all`을 worker 20~30개로 한 번 불러 보고 `pending` 최대값과 Prime 호출 지연을 로그로 본다(실행 중 Titan을 건드리지 않는 테스트 하네스에서).
- 깨지는 목표: 4(네이버 자동화 중 close-all이나 cleanup이 몰리는 순간).
- 고치는 방법: `worker-tab-cleanup.ts`에 모듈 단위 직렬 대기열(동시 1개)을 두고, 브로커 pending이 일정 수(예: 24) 이상이면 대기열이 기다리게 한다(`BrowserControlBroker`에 `pendingCount()` 접근자 추가). 작은 변경이고 기존 테스트는 그대로 통과해야 한다.

### E. "닫을 때마다 다시 확인한다"는 설명이 사실이 아니다 - 목표 3 (좁은 경합)
- 무슨 일: `worker-tab-cleanup.ts:44` 주석은 "claim과 각 close에서 다시 확인"이라고 한다. 앱 쪽 `allowed()`는 claim 때 한 번, 확장의 `authorize(command)`가 부르는 `check` 때 한 번만 실행된다. `closeCreated`는 반복문 앞에서 `authorize`를 한 번 부르고(`extension/browser-control.js:277`) 탭마다 다시 부르지 않는다. 대조: 입력 계열 `input()`은 매번 `authorize`한다(`:136` 근처 `input`). 그래서 worker가 깨어나는(waking) 순간이 반복문 중간이면 남은 탭이 계속 닫힌다.
- 등급: 코드. 창은 탭당 수십 ms~수 초 수준이라 드물다(추정).
- 깨지는 목표: 3(잠들었다가 깨어나는 worker, 매우 좁음).
- 고치는 방법: `closeCreated` 반복문 안에서 각 탭 `tabs.remove` 직전에 `await authorize(command)`. 비용은 탭당 로컬 왕복 한 번. 주석도 사실대로 고친다.

---

## 깨지는 목표가 없는 발견 (한 줄씩)
- F. 확장이 옛 버전, 앱이 새 버전일 때: 확장은 `close_created`를 모르므로 `owned(command)`로 떨어져 `chrome.tabs.get(undefined)`가 던진 오류가 결과로 돌아간다(코드 추정 읽기, 실행 안 함). 탭은 안 닫히고 재시도 3번(2/10/30초)이 pending만 잠깐 쓴다. 옛 확장은 `created` 기록도 안 만들므로 해롭지 않다. 재로드 후에도 `storage.session`은 확장 업데이트 때 비므로 재로드 전에 만든 탭은 안 닫힌다(안전한 방향). 개선 여지: 이 오류는 재시도하지 않게 거르기.
- G. `reopening`이 true인 채팅은 정리가 영영 호출되지 않는다(`bridge-routes-activity.ts:461-467`). 재오픈이 끝내 실패하면 그 worker의 탭은 샌다. 변경 전과 같은 상태라 해롭지 않다.
- H. 변경이 추가한 `owners` 힌트 `.slice(0,32)`(`extension/browser-control.js:712`)는 앱의 32개 한도(`bridge-routes-browser.ts:195`)와 맞고, 붙은 탭 먼저 채운다. 이전에는 33개 이상이면 claim이 400으로 거부되었으므로 개선이다. 문제 없음.
- I. 기존 실패와 18000자 제한: `mcp.test.ts`의 "Core server instructions"는 18318로 실패한다. 이번 변경이 `instructions.ts:39`에 77자를 더했으므로 변경 전은 18241(코드: 문자열 길이 계산, 변경 전 파일은 실행하지 않음)이다. 이미 한도를 넘은 상태였고 이번 변경이 0.4% 더 악화시켰다. 목표 줄에는 영향 없음. 같은 파일의 다른 실패("does not leak previously approved paths")는 Windows 경로 이스케이프 문제로 이번 변경과 무관(실패 메시지의 `\\` 이스케이프 차이).

## 확인한 것 (맞음)
- 모델이 `close_created`를 부를 길은 없다: `tools-browser.ts:50`의 `z.enum`에 없고 `.strict()`다. 앱 내부 `execute` 호출로만 간다.
- Prime 보호: `departedWorkerOwner`가 session origin이 worker이거나 agent role이 worker일 때만 owner를 낸다(`worker-tab-cleanup.ts:32`). 테스트 `worker-tab-cleanup.test.ts:136-152`.
- owner 문자열: 정상 호출은 `session:<id>`(`tools-browser.ts:113`). `request:` 소유 기록은 앱이 `requestCorrelation`으로 그 세션 것임을 증명한 별칭만 인정한다(`browser-control.ts:50-52`, `bridge-routes-browser.ts:195-200`). 증명 못 하면 안 닫는다(안전한 방향). `unattributed`는 닫지 않는다.
- tab id 재사용: 기록은 `chrome.tabs.onRemoved`에서 지우고(`background.js:5393`) `storage.session`이라 브라우저 재시작과 함께 사라진다. 저장된 기록에 남은 id가 이미 없으면 `getTab`이 `BROWSER_TAB_CLOSED`를 던져 기록을 지운다. 변경 안 한 attach만 한 탭은 기록이 없어 안 닫힌다(`new`에서만 `noteCreated`, `:575`).
- Compact & Resume: 세션이 새 채팅으로 옮겨 간(rebind) 뒤 옛 채팅은 세션을 못 찾아 null, 진행 중에는 `compactingConversation`이 막는다(`continuation.ts:645`). owner가 `session:<id>`로 같아 새 채팅에서도 이어진다.
- 복구 재오픈: `queueMissingTab`이 true면 정리를 건너뛴다. 다른 브라우저에 채팅이 열려 있으면(`chatHolders`) 건너뛴다. 테스트 있음.
- 마지막 탭 보호: 정상 창의 마지막 탭이면 `chrome://newtab/`을 먼저 연다(`:269-274`).
- 네이버 close-all: `forcedTabCloseWanted`로 manual=true가 되어 재오픈 없이 곧바로 정리된다(`bridge-routes-activity.ts:430`). Prime 채팅은 owner가 안 나와 영향 없음. `/v1/sessions/{id}/cleanup`은 확장의 정리 시계만 당기므로(`control-cleanup.ts` 주석) 닫힌 뒤 일반 `/closed` 경로로 같은 동작.

## 테스트 실행 결과
- 실행: `test/worker-tab-cleanup.test.ts`(10건) 통과, `test/browser-control-created-tabs.test.ts` 통과, `test/log-identity.test.ts` 통과, `test/mcp.test.ts` 2건 실패(위 I).
- 기존 실패 13건 표본: 전체 `vitest run`(mcp-shutdown, computer 제외)을 돌렸으나 15분 한도 안에 끝나지 않아 중간까지만 봤다(미확인: 나머지). 그때까지 실패는 `test/app-name.test.ts` 2건, `test/renderer-i18n.test.ts` 1건("covers every static app label in every catalog"), `test/mcp.test.ts` 2건, 합계 5건이다. 이 변경은 `renderer`·locale 파일을 건드리지 않고(`git diff HEAD~1 --stat`), 추가한 줄에 옛 브랜드명 "Chat On Steroids"가 없다(`git diff HEAD~1 | grep -ci steroids` = 0). `app-name`은 그 문자열을 다른 파일에서 찾아 실패하므로 변경과 무관해 보인다(등급: 코드, 변경 전 커밋에서 같은 테스트를 돌려 대조하지는 않았음). 13건 전부가 무관하다는 확인은 못 했다. 확인 방법: `git worktree`로 `HEAD~1`을 따로 만들어 같은 명령을 돌려 실패 목록을 비교.

## 사용자만 답할 질문
1. (목표 3, 4) worker가 finish로 잠들면 그 worker가 연 탭이 바로 닫히는 것이 원하는 동작인가? 네이버 자동화에서 worker가 일을 마친 뒤 같은 탭을 Prime이 읽거나 worker를 깨워 다시 쓰는 일이 있는가?(A)
2. (목표 3) Prime이나 사람이 worker가 만든 탭을 `browser_snapshot`으로 읽거나 직접 쓰는 일이 실제로 있는가? 있으면 B·C 수정이 필요하다.
