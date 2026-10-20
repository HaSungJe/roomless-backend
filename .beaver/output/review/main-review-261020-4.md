# Review — main — 261020-4

> ship 전 재리뷰. 1차 리뷰([main-review-261020-3.md](main-review-261020-3.md))의 Findings 처리 결과와, 리뷰 중 사용자가 정한 서버 분할 방향을 기록한다.

## Target
- mode: direct (worktree 없음) — branch: `main` → origin: `origin/main`
- 포함 작업: user-sms-verification (로드맵 Phase 4) + 리뷰 후속 Change 261020-1
- 이번 재리뷰 범위: 1차 이후 바뀐 것
  - `apps/gateway/src/api/v1/user/user.controller.queue.ts` 주석 4곳
  - 풀 · 동시 명령 수 수정을 넣었다가 되돌린 결과
    - 코드: `libs/database/src/typeorm.config.ts` · `libs/messaging/src/messaging.{util,constants}.ts` · `apps/user-service/src/user-service.module.ts`
    - 그 밖: spec 2개 · `.env.example` · README · AGENTS.md · docs · plan · report

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming · Structure · Errors · Swagger | pass | 1차 리뷰 그대로다. 1차 이후 남은 코드 변경은 게이트웨이 주석뿐이다 |
| 되돌리기 완전성 | pass | 풀 수정만 들어갔던 파일 5개는 HEAD 로 되돌렸고, 새 spec 2개는 지웠다. 섞인 파일(모듈 · `.env.example` · AGENTS.md · data-layer · architecture · README · plan)은 풀 관련 부분만 뺐다. `USER_SERVICE_COMMAND_PREFETCH` · `resolveCommandPrefetch` · `getDatabasePoolSize` · `PREFETCH_RESERVED_DB_CONNECTIONS` 흔적이 소스 · 문서에 0건이다 |
| README 갱신 | pass | Phase 4 내용(user-service 기능 · `SMS_VERIFICATION_DAILY_LIMIT`)만 남았다 |

## Data-Access Smoke Coverage
1차 리뷰 그대로 — 쿼리 변경 없음.

## Memory Reconcile
`.beaver/memory/` 에 `미반영` 항목 없음.

## Intended Behavior Check
- Phase 4(#21 · #22 · #23 · #26 · #27)는 1차 대조 그대로 plan/spec 과 일치한다.
- 게이트웨이 큐 라우트 주석의 `done 의 data` 를 실제 결과 DTO(인증 ID · 만료 시각 / 아이디 · SNS · 가입일시)에 맞췄다.
- 검사: plan 검증 · `npm run typecheck` · `npm run lint` · `npm run build` · Prettier 통과. 테스트 실행은 `/beaver:test` 에서 한다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | High (미룸) | `user.repository.ts` `consumeSmsVerificationAttempt` · `libs/database/src/typeorm.config.ts` | 1차 #1 그대로다. 확인 명령 10건이 한 인스턴스에 동시에 들어오면 DB 연결 풀이 교착된다(동시 명령 수 10 = 풀 10, 대기 제한 없음). 상세는 표 아래 | 다음 단계(서버 분할)에서 고친다. **운영 배포 전에 끝낸다** |
| 2 | Low | `user.service.ts` `confirmPasswordReset` | 1차 #2 그대로 — SMS 503 재시도마다 시도 횟수가 1회 소비된다 | 기록만 한다 |
| 3 | Low | `user.service.ts` 발송 3개 | 1차 #3 그대로 — 동시 요청 시 하루 한도를 몇 건 넘길 수 있다 | 기록만 한다 |

### Finding #1 — 사용자 결정으로 다음 단계로 미룬 경위
- 처음에는 이번 ship 안에서 고쳤다.
  - 동시 명령 수를 env 로 두고 풀 − 2 로 묶었다.
  - 연결 대기를 10초로 제한했다.
- 그런데 사용자가 crontab 을 별도 scheduler 서버로 빼기로 했다. 그래서 풀 규칙을 서버 분할과 함께 설계하도록 되돌렸다.
- crontab 을 빼는 것만으로는 #1 이 사라지지 않는다. 교착의 원인은 확인 명령 자체("연결 1개를 잡은 채 1개를 더 기다림")이기 때문이다.
- 다음 단계에서 함께 넣는다.
  - 인스턴스당 동시 명령 수 env
  - "항상 DB 연결 풀보다 작게"(≤ 풀 − 1) — crontab 이 user-service 에서 빠지므로 남겨 둘 연결은 없다. `− 1` 은 "작게"를 정수로 쓴 것이다
  - 풀 연결 대기 시간 제한

## 서버 분할 결정 (리뷰 중 사용자 결정, 2026-10-20)
| 서버 | 역할 | 들어오는 연결 | 인스턴스 |
|---|---|---|---|
| gateway | 유일한 입구 | 외부 요청 | 2 |
| user-service | 이용자 — 회원 · 예약 · 결제 · 이용 (트래픽 집중 → 로드밸런싱) | 게이트웨이만 | 2 |
| admin-service | 총관리자 + 업체(객실) 관리자 | 게이트웨이만 | 1 |
| scheduler | crontab 만 — 컨트롤러 · 큐 소비 없음, DB 에 직접 붙어 작업 | 없음 | 1 |

- 인스턴스 수는 `.env` 의 `*_REPLICAS` 로 관리한다.
- 로드맵의 바로 다음 단계로 넣는다(로드맵 갱신 커밋).

## Verdict
Pass(조건부) — #1(High)은 사용자가 다음 단계로 미루기로 결정했고, 운영 배포 전에 고친다. #2 · #3 은 Low 로 기록만 한다. 커밋 → 푸쉬 → 로드맵 갱신 커밋으로 진행한다.
