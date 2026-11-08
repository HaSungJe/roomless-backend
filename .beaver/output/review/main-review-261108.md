# Review — main — 261108

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: `main`(direct mode — worktree 없음) → origin: `main`
- Included features: 이용(Phase 19 — #78 · #79 · #83 · #121 · #122 · #123, #82 dropped) — [plan](../plan/reservation/reservation-usage-plan.md) · [spec](../spec/reservation/reservation-usage-spec.md) · [report](../report/reservation/reservation-usage-report.md)
- Change scope: 66 files changed(+ 새 파일 16) — 엔티티 3 · 마이그레이션 1 · contracts(상수 · 명령 · DTO 4 새 + 4 수정) · user-service reservation · door · admin-service reservation · scheduler reservation(crontab 2 새) · gateway 라우트 4 · compose · env 예시 · 문서

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | crontab `reservation-usage.crontab.ts` · `reservation-qr-link.crontab.ts`, DTO kebab · 기능당 1개(`*-cancel-request{,-approve,-reject}.dto.ts` · `*-use-cancel-request.dto.ts`), 엔티티 `t_door_open_log` · `t_reservation_cancel_request(_state)`, 제약 `PK_/FK_/IDX_/UK_`(부분 유니크), 명령 `user.reservation.cancel-request-approve` · `admin.reservation.use-cancel-request` |
| Structure & layering | pass | 행위자별 서버(업체 관리자 요청 → admin-service, 이용자 승인 · 거절 · 조회 → user-service, 전환 · 링크 → scheduler), controller 위임만, crontab → repository 직접(운영 가드 · `JobLockService`), scheduler 여러 쓰기는 repository `withTransaction` + 상태 조건, 앱끼리 import 없음 |
| Shared logic extraction | pass | 판정 · 계산은 도메인 util(`judgeUsageTransition` · `calculateCancelRefund` · `cancelRequestState` · `cancelRequestExpiresAt` · `toEndedUsageRoomState`), service private 헬퍼 0, 호실 상태 규칙은 contracts `USAGE_ROOM_STATE` 하나 |
| Errors & responses | pass | 규칙 위반 400 · 404 · 503(링크 주소 없음), repository 통일 500 · 부분 유니크 제약명 분기 400, 응답 필드 null 포함(`cancel_request_state_id` · `cancel_request_created_at`), 외부 단계(Redis `revokeQr` · `setQr` · SMS)는 마지막 |
| Test strength | pass(1건 보완 권고) | 계산 표 4종을 service spec 이 지난다(usage-transition 10 · room-state 9 · cancel-refund 12 · cancel-request 13), 쓰기 엔티티 값 · 호출 순서 · 미호출 단언, 새 QueryBuilder 4종 Smoke 고정 — 관계 컬럼 find · `In` update 조건은 mock 인자만(아래 #1) |

memory: `git`(산출물 커밋 포함 — 지킴) · `api-log`(해당 없음) · `cache`(미반영 code rule — 캐시 코드가 아직 없어 이번 변경과 무관, Phase 23 에 옮긴다).

## Intended Behavior Check (against plan/spec)
- **이용 시작 · 종료(#79 · #83)** — scheduler 가 끝(확정 · 이용 중 · `end_at ≤ 지금` → 이용 완료 + 사용중 → 정비중)을 먼저, 시작(확정 · `start_at ≤ 지금 < end_at` → 이용 중 + 예약가능 · 예약완료 · 정비중 → 사용중 + QR `ON CONFLICT DO NOTHING` → Redis)을 나중에. 결제 확인 · 내 예약 QR 도 같은 경계 · 같은 호실 규칙. 맞음.
- **내 예약 QR** — 이용 중에만, 시작 정각부터(5분 전 링크와 무관), 시작했는데 확정이면 그 자리 전환. 맞음.
- **QR 링크 SMS(#78)** — 확정 · 이용 중 · `start_at ≤ 지금 + 5분` · `end_at > 지금` · 미발송 · 번호 있음, 표시 → 발송 → 실패면 되돌림, `USER_WEB_URL` 없으면 안 보냄. 맞음.
- **문 열림 기록(#121)** — 이력 없는 QR 은 Redis 를 안 보고 false, 맞을 때만 한 줄. `checked_in_at` · `completed_at` 삭제. 맞음.
- **사용중지 환불(#122)** — 확정 · 이용 중을 끝 전까지 100%(사유 `사용중지 호실 취소`), 이용 중이면 QR 끝 · Redis 마지막, 호실 그대로, 목록 · 상세 `is_room_disabled`. 맞음.
- **이용 중 업체 취소 동의(#123)** — 요청(이전 요청 중 만료 · 부분 유니크 · 10분 또는 예약 끝 · SMS 마지막), 조회(보이는 상태 · 환불 예정액), 승인(업체 취소와 같은 결과 + 사용중 → 정비중 + Redis 마지막), 거절(요청만), 업체 현황 표시, 업체 취소는 시작 전만. 맞음.
- 빠진 것 · 잘못된 것 없음. plan 대비 차이(호실 끝 상태 함수 하나로 · util 이 만든 엔티티를 repository 에 넘김 · 마이그레이션의 같은 인덱스 재생성 제거)는 report 에 적었다.
- 리뷰 중 확인: 아래 #1 의 메서드들을 임시 Smoke 로 빌드해 SQL 이 맞는 것을 봤다(관계 컬럼 `=` · `IN ($n…)` · `IS NULL` · `ORDER BY created_at DESC`, 지워지지 않은 호실 조건 포함). 임시 파일은 지웠다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Medium | apps/user-service/src/door/repositories/door.repository.ts `findDoorRoomQr` · apps/user-service/src/reservation/repositories/reservation.repository.ts `findLatestCancelRequest` · `updateReservationRoom` · apps/scheduler/src/reservation/repositories/reservation.repository.ts `startUsage` · `endUsage` | 관계 컬럼 where(`room_id` · `reservation_id`) · 정렬 · 관계 컬럼 `In(...)` 을 건 update 가 repository spec 에서 mock 호출 인자로만 확인된다 — docs/testing.md "Data-Access Smoke" 대상(관계 필드 where)인데 SQL 빌드 고정이 없다. 지금 SQL 은 맞다(리뷰 중 임시 빌드로 확인) | repository spec 에 Smoke 추가 — `vi.spyOn(dataSource.manager, 'findOne' \| 'update')` 로 넘긴 옵션 · 조건을 가로채 `setFindOptions` · `createQueryBuilder().update().set().where()` 로 빌드해 SQL 고정 |
| 2 | Low | apps/admin-service/src/reservation/reservation.util.ts `readUserWebUrl` · apps/scheduler/src/reservation/reservation.util.ts `readUserWebUrl` | util 이 `process.env.USER_WEB_URL` 을 직접 읽는다(전역 util `readPositiveInt` 은 값을 인자로 받는다). 같은 함수가 두 앱에 있다(앱끼리 import 금지라 의도된 중복) | 그대로 둠 — 읽는 곳이 한 줄이고 테스트가 env 로 확인한다. 바꾸면 `normalizeUserWebUrl(value)` 로 인자화 |
| 3 | Low | apps/user-service/src/reservation/reservation.service.ts `cancelReservation` | 이용 중 취소 요청이 진행 중일 때 이용자가 사용중지 전액 환불로 직접 취소하면 요청은 요청 중으로 남았다가 10분 뒤 만료로 보인다(승인하면 상태 바뀜 400 — 데이터는 안전) | 그대로 둠 — 필요하면 취소 때 요청 중을 만료로 바꾸는 한 줄 |
| 4 | Low | apps/scheduler/src/reservation/crontabs/reservation-qr-link.crontab.ts | 배포 직후 첫 회차에 이미 이용 중인 예약(`qr_link_sent_at` NULL)에도 링크가 한 번 간다 | 그대로 둠 — 끝 전 예약이라 링크가 유효하다. 배포 안내에 적는다 |

## Verdict
Changes needed(권고) — #1 Smoke 고정을 더하고(코드 변경 없음, 테스트만) 다시 확인한 뒤 커밋을 권한다. #2 ~ #4 는 그대로 둔다.

### 재확인 (같은 날)
- 사용자 선택: #1 반영 후 커밋 · 푸쉬. #2 ~ #4 는 그대로.
- #1 반영 — Smoke 6건(user-service door `findDoorRoomQr` · reservation `findLatestCancelRequest` · `updateReservationRoom`, scheduler `startUsage` · `endUsage` · `claimQrLink`), report Modification 261108-1. 전체 108파일 1148건 · typecheck · lint 통과.
- Pass — 남은 Medium 이상 없음.
