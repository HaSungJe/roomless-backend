# Review — main — 261105-2

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: 해당 없음(direct mode) → origin: `main`
- Included features: 문 관리 · QR 확인(로드맵 Phase 15) — 첫 리뷰 [main-review-261105.md](main-review-261105.md) 의 Finding 1 · 2 수정분 재리뷰
- Change scope: 수정분 — 문 포트(상수 · 인터페이스 · Redis 어댑터) · store service · gateway 문 소켓 server · util · store 테스트 도우미 · 시크릿 spec · room 테스트 도우미 · 문서 6개 · report 변경 회차

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | `DOOR_COMMAND.DISCONNECT` · `DoorOpenCommand` · `DoorDisconnectCommand` · 포트 `disconnect` · `DOOR_SOCKET_SECRET_CHANGED_CLOSE` · private `applyCommand` · `disconnectStore`(인프라 클래스) |
| Structure & layering | pass | service 는 포트(`DOOR_STORE`)만 알고, 연결을 실제로 끊는 일은 gateway 인프라가 한다. 앱끼리 import 없음, 명령 모양은 `libs/integration` 인터페이스 한 곳 |
| Shared logic extraction | pass | service private 헬퍼 없음, 종료 코드 · 이유는 소켓 util 상수 |
| Errors & responses | pass | Redis 503 은 잡지 않는다 → 큐 재시도 → 롤백. 외부 단계(PUBLISH)는 쓰기 뒤 마지막 |
| Test strength | pass | 호출 1번 · 인자 · `updateStore` 뒤 순서(invocationCallOrder) · 404 미호출 · 503 requeue → dead + failed 503 |
| 문서 | pass | README · AGENTS(실시간 소켓) · realtime.md(규칙 · 경우별 결과 행) · integration.md · redis 가이드 · data-layer.md(훅 문구 · 시크릿 변경) 같은 변경에서 갱신 |

## Intended Behavior Check (against plan/spec)
- **Finding 1 해결**: 시크릿 저장 뒤 `{store_id, command: 'disconnect'}` 를 PUBLISH 한다. gateway 인스턴스마다 그 업체의 자기 연결을 모두 1008 로 닫고, close 이벤트가 연결 묶음에서 빼낸다. 옛 시크릿으로는 다시 붙지 못하고(401), 새 시크릿으로만 붙는다.
- **Finding 2 해결**: data-layer.md 를 "QueryBuilder insert 도 `execute()` 때 `@BeforeInsert` 가 돈다 — Smoke 는 빌드만 해서 spec 이 `insertTimestamp()` 를 부른다" 로 고침.
- 확인: PUBLISH 는 `@Transactional()` 안(커밋 전)이다.
  - 커밋이 실패하면 시크릿은 그대로인 채 연결만 끊긴다. 문 프로그램은 옛(= 그대로인) 시크릿으로 다시 붙으므로 해가 없다.
  - 반대로 커밋은 됐는데 연결이 안 끊기는 경우는 없다. PUBLISH 가 실패하면 503 으로 롤백되기 때문이다.
- 그 밖의 기능 동작은 첫 리뷰 그대로.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Info | 첫 리뷰 Finding 3 · 4 · 5 | 접속 시도 제한 없음 · 업체 취소의 QR 지우기가 커밋 전 · 지운 호실의 Redis 키 잔존 | 지금 구조 유지(첫 리뷰와 같음) |

## Verdict
통과 — Medium · Low 둘 다 고쳤다. typecheck · lint(경고 0) · build · db:check 와 전체 테스트 97파일 922건 통과. 커밋으로 넘어간다.
