# Review — main — 261103

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: 해당 없음(direct mode) → origin: `main`
- Included features: 예약·결제(로드맵 Phase 17 — #67 ~ #73 · #113) — user-service 예약 도메인(공개 9) · scheduler 예약 crontab 3 · 결제 포트 확장(부분 취소 · 조회 대조) · 업체 환불 규정(분 · 비율) · 연박 박수 · 1박 항상 다음 날 · 점유 예약이 있는 호실 · 그룹 삭제 금지 · 마이그레이션 `ReservationBooking`
- Change scope: 수정 53 · 새 파일 46(user-service 예약 21 · gateway 3 · scheduler 9 · contracts 11 · 마이그레이션 1 · report) + spec · plan · 이 리뷰, `git diff HEAD` 553+ / 155−(새 파일 제외)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 도메인 파일 `reservation.<role>.ts` · crontab `reservation-<feature>.crontab.ts` · DTO `reservation-<feature>.dto.ts` · 명령 `user.reservation.<action>` · 내부 경로 `/internal/v1/user-service/reservation` · 컬럼 `refund_deadline_minutes` · `late_refund_percent` · `min_nights` · CHECK 식을 바꾸며 이름도 바꿈(`CHK_Payment_RefundedAmount`) |
| Structure & layering | pass | controller(동기 · 큐 두 파일) → service → repository, crontab → repository(scheduler 에만), 공유 DB 는 소유 도메인 어휘로 읽기(`findReservationStore` · `findBookableRooms`), 앱끼리 import 없음, 공통 값은 `libs/contracts` · 토스 대조는 `libs/integration` 순수 함수 |
| Shared logic extraction | pass | service private 헬퍼 0 — 재고 판정 · 요금 · 환불액 · 응답 변환은 `reservation.util.ts`, crontab 엔티티 조립은 scheduler `reservation.util.ts`. 날짜 · 시각은 `@app/common/utils/dayjs.js`(정렬 비교 1곳 예외 — Finding 2) |
| Errors & responses | pass | 23P01 → 400 은 repository 제약명 분기(두 곳), 상태 조건 쓰기 boolean → service 400 롤백, 커밋해야 하는 실패(금액 불일치 · 늦은 결제)는 예외 반환, 외부 503 은 잡지 않음 · 발송은 마지막 단계, 응답 null 필드 생략 없음 |
| Test strength | pass(1건 제외) | service spec 이 두 경로를 부팅해 호출 인자 · 엔티티 값 · 미호출 · 판정(ack/requeue)까지 단언, TDD 표 가용성 14 · 환불액 8, QueryBuilder 빌더 9개 Smoke 고정. find 로 실행하는 관계 필드 조건은 mock 으로만 지난다 — Finding 1 |
| memory | pass | `.beaver/output` 커밋 포함(git), 자격증명 로그 정책 무관. cache 항목(미반영)은 캐시 코드가 생기는 Phase 23 후보 — 제안하지 않음 |
| 기타 규약 | pass | README · AGENTS · docs(architecture · data-layer · integration · messaging · toss 가이드) 같은 변경에서 갱신, mock 어댑터 없음, crontab 운영 가드 · `JobLockService`, compose 는 scheduler 만 토스 키를 덮지 않게 |

## Intended Behavior Check (against plan/spec)
- **재고 판정 · 요금**: spec 규칙 그대로 — 업체 활성 · 영업중, 상품 판매, 사용중지 호실 제외 · 30분 안 즉시 입실은 예약가능만, 지금 이후 · 예약 가능 기간, 입실일 요일만, 대실은 구간 전체 · 숙박/연박은 체크인 [ · 체크아웃 ] 영업시간 · 브레이크(전날 자정 넘김 창 포함 · 24시간 업체는 영업시간 생략), 일시 예약불가, 점유 [시작, 끝 + 정비). 대실 30분 단위, 1박 항상 다음 날, 연박 박마다 기간 요금. 표 14개 통과.
- **결제 대기 · 확인 · 만료 · 환불**: 5분 · 10분 재예약 제한 · 토스 조회 대조 4가지(다른 주문은 환불 안 함) · 반환된 실패 · crontab 3개(조회로 확정/만료, 30분 재확인, 금액 지정 취소 → 완료/실패/다음 회차) — spec 대로.
- **취소 · 업체 측 변경**: 마감 전 100% · 마감 뒤 예약 때 비율(내림) · 시작 뒤 불가, 결제 대기 취소는 결제 만료, 업체 취소 100% + SMS(번호 있을 때), 호실 이동 같은 그룹 · 사용중지 아님 · 시작 전 확정만 + SMS.
- **조회 · 설정 · 삭제**: 내 예약(만료 숨김 · 페이지) · 상세(구간 · 결제) · 업체 현황(이용자 이름 · 휴대폰), 환불 규정 분 · 비율(예약에 저장), 연박 박수, 점유 예약 호실 · 그룹 삭제 400. 마이그레이션은 데이터를 지키며(× 60 · 기본값 채움) PGlite 14/14.
- 빠진 것 · 잘못 구현된 것 없음. plan 과 다른 점은 report 에 기록(notDeleted 제네릭).
- 리뷰 확인: TypeORM 1.1.2 `update(where, 엔티티)` 는 엔티티를 BeforeUpdate 리스너에 넘긴다(UpdateQueryBuilder.execute → broadcast) — 재확인 crontab 의 `updated_at` 30분 창은 만료 시각 기준으로 맞게 동작한다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Medium | `apps/user-service/src/reservation/repositories/reservation.repository.ts` `findReservations` · `findUnavailablePeriods` · `findGroupPlans` · `findGroupPlanPrices` · `findStoreHours` · `findStoreBreaks` · `countReservations`, `apps/admin-service/src/room/repositories/room.repository.ts` `countRoomActiveReservations` | 관계 필드 where(`In` · `LessThan` · `MoreThan` · `Not`)를 find 로 실행하는데 spec 은 repository 를 mock 해 조건 매핑을 한 번도 돌리지 않는다(docs/testing.md Smoke 대상 — 형제 store `buildStoreHoursQuery` · `buildUnavailablePeriodListQuery` 는 Smoke 로 고정). 리뷰에서 `setFindOptions` 로 같은 조건을 빌드해 보니 SQL 은 모두 맞다(`"room_id" IN (…)` · `"start_at" < $` · `"reservation_state_id" != $`) | 각 조건을 `setFindOptions` 로 빌드하는 Smoke 케이스를 repository spec 에 더해 SQL 을 고정한다(특히 점유 판정 `findReservations`) |
| 2 | Low | `apps/user-service/src/reservation/reservation.util.ts` `mergeWindows` | 창 정렬을 `a.start.valueOf() - b.start.valueOf()` 로 한다 — AGENTS "날짜 · 시각 비교는 dayjs(`getTime()` 비교 ❌)" 에 걸린다(결과는 같다) | `a.start.isBefore(b.start) ? -1 : a.start.isAfter(b.start) ? 1 : 0` 으로 |
| 3 | Low | `docs/testing.md` Data-Access Smoke "현재 적용" | AGENTS.md 의 Smoke 적용 목록은 갱신했지만 docs/testing.md 목록에 예약 · scheduler 예약 · 그룹 점유 예약이 없다 | 목록에 더한다(Finding 1 을 고치면 그 케이스도) |
| 4 | Info | `libs/integration/src/payment/toss-payment.gateway.ts` · scheduler crontab | 토스 실제 호출(조회 · 부분 취소)은 확인하지 않았고, crontab 은 운영에서만 돌아 로컬에서 만료 · 환불이 안 된다(규약) | 테스트 키로 가이드 6절 순서대로 확인 — scheduler 는 production 으로 |

## Verdict
변경 필요(Medium 1 · Low 2) — 셋 다 작은 수정이다. 고치고 다시 리뷰(`main-review-261103-2.md`)한 뒤 커밋한다.
