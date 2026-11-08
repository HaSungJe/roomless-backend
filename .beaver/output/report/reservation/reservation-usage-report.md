# Report — reservation-usage

## Feature Summary
- **Feature**: 이용(Phase 19) — 체크인 · 체크아웃 없이 예약 시간이 곧 이용 권한이다.
  - 시작 시각: 예약 이용 중 + 호실 사용중 + QR 발급
  - 끝 시각: 이용 완료 + 호실 사용중 → 정비중
  - 그 밖: QR 확인 링크 SMS(시작 5분 전) · QR 문 열림 로그 · 사용중지 호실 전액 환불 취소 · 이용 중 업체 취소는 이용자 동의(링크 · 로그인 승인 10분)
- **Entry point**:
  - scheduler crontab `reservation.usage`(1분) · `reservation.qr-link`(1분)
  - 업체 관리자 `POST /api/v1/admin-service/reservation/:reservation_id/use-cancel-request`(큐 `admin.reservation.use-cancel-request`)
  - 이용자 `GET /api/v1/user-service/reservation/:reservation_id/cancel-request`(동기) · `PATCH …/cancel-request/approve` · `…/reject`(큐 `user.reservation.cancel-request-{approve,reject}`)
  - 기존 변경: 내 예약 QR · 목록 · 상세 · 이용자 취소 · 결제 확인 · 업체 취소 · 업체 현황 · 문 소켓 QR 확인
- **Domain**: reservation(user-service · admin-service · scheduler) · door(user-service) · libs/database — 로드맵 Phase 19 의 #78 · #79 · #83 · #121 · #122 · #123(#82 dropped)
- **Plan**: [reservation-usage-plan.md](../../plan/reservation/reservation-usage-plan.md) · **Spec**: [reservation-usage-spec.md](../../spec/reservation/reservation-usage-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/reservation/reservation.entity.ts` | modified | `checked_in_at` · `completed_at` 삭제, `qr_link_sent_at` 추가, `start_at` · `end_at` 주석(이 시각에 이용 중 · 이용 완료) |
| `libs/database/src/entities/door/door-open-log.entity.ts` | created | `t_door_open_log` — 호실 · 예약 · QR · 연 시각, 인덱스 2 |
| `libs/database/src/entities/reservation/reservation-cancel-request-state.entity.ts` · `reservation-cancel-request.entity.ts` | created | 룩업 · 요청 표(부분 유니크 `UK_ReservationCancelRequest_ReservationIdRequested`) |
| `libs/database/src/entities.ts` · `seeder/seeder.targets.ts` | modified | 엔티티 3개 등록, 요청 상태 시드 4행 |
| `libs/database/src/migrations/1794141398748-ReservationUsage.ts` · `migrations.ts` | created · modified | `db:generate` — 생성기가 넣은 예약 인덱스 2개 같은 정의 재생성(down 은 컬럼 순서가 뒤바뀜)은 뺐다, 설명 주석 |
| `libs/contracts/src/reservation/reservation.constants.ts` · `reservation.commands.ts` | modified | `USAGE_ROOM_STATE` · `RESERVATION_CANCEL_REQUEST_STATE` · `RESERVATION_CANCEL_REQUEST_MINUTES` · 환불 사유 `DISABLED_ROOM`, 명령 3 · 내부 경로 `cancelRequest()` |
| `libs/contracts/src/reservation/dto/reservation-use-cancel-request.dto.ts` · `reservation-cancel-request.dto.ts` · `-approve.dto.ts` · `-reject.dto.ts` | created | 기능당 DTO |
| `libs/contracts/src/reservation/dto/reservation-list.dto.ts` · `reservation-detail.dto.ts` · `reservation-store.dto.ts` · `reservation-payment-confirm.dto.ts` | modified | `is_room_disabled`, `cancel_request_state_id` · `cancel_request_created_at`, 결제 확인 상태 설명(CHECKED_IN) |
| `apps/user-service/src/reservation/reservation.util.ts` · `reservation.constants.ts` | modified | `judgeUsageTransition` · `toEndedUsageRoomState` · `calculateCancelRefund` · `cancelRequestState` · `toCancelRequest`, `judgeReservationQr`(이용 중만 · START), `toReservationListItem`(`is_room_disabled`), `isReservationStarted` · `RESERVATION_QR_STATES` 삭제 |
| `apps/user-service/src/reservation/reservation.service.ts` · `interfaces/…` · `repositories/reservation.repository.ts` · `controllers/*` | modified | 결제 확인(시작이면 이용 중) · 내 예약 QR(그 자리 이용 시작) · 이용자 취소(이용 중 · 사용중지 100% · QR 끝) · 새 `getMyCancelRequest` · `approveCancelRequest` · `rejectCancelRequest`, repository `updateRoomQr` · `updateReservationRoom` · `findLatestCancelRequest` · `updateCancelRequest` · 목록 select `rm.room_state_id` |
| `apps/user-service/src/door/door.service.ts` · `interfaces/…` · `repositories/door.repository.ts` | modified | QR 확인: 이력(`t_room_qr`) 먼저 → Redis → 맞으면 열림 기록, `@Transactional` |
| `apps/user-service/src/user-service.module.ts` | modified | 문 정보 포트 사용처 주석 |
| `apps/admin-service/src/reservation/reservation.service.ts` · `reservation.util.ts` · `reservation.constants.ts` · `interfaces/…` · `repositories/reservation.repository.ts` · `controllers/reservation.controller.queue.ts` | modified | 업체 취소는 시작 전만(QR 끝내기 · `DOOR_STORE` · `findRoomQr` · `updateRoomQr` · `isRoomQrActive` 삭제), 새 `requestUseCancel`(링크 주소 503 · 이용 중 · 번호 · 이전 요청 만료 · 부분 유니크 400 · SMS 마지막), 현황 상관 서브쿼리 3개 |
| `apps/admin-service/src/admin-service.module.ts` | modified | SMS · 문 정보 사용처 주석 |
| `apps/scheduler/src/reservation/crontabs/reservation-usage.crontab.ts` · `reservation-qr-link.crontab.ts` | created | 이용 전환(끝 먼저 → 시작 · QR · Redis) · QR 확인 링크 SMS(표시 → 발송 → 실패면 되돌림) |
| `apps/scheduler/src/reservation/` (util · interfaces · repositories · qr-sync crontab · module) · `scheduler.module.ts` | modified | `UsageRow` · `QrLinkRow`, 대상 쿼리 3개 · `startUsage` · `endUsage`(withTransaction · 상태 조건) · `claimQrLink` · `releaseQrLink`, QR 동기화는 이용 중만, `SmsModule` |
| `apps/gateway/src/api/v1/user-service/reservation/controllers/*` · `api/v1/admin-service/reservation/controllers/reservation.controller.queue.ts` | modified | 공개 라우트 4개 |
| `compose.scheduler.yml` · `.env.example` | modified | scheduler 에 AWS 키 전달(빈 값 덮기 삭제), `USER_WEB_URL` |
| 테스트 — 아래 Tests Written | created · modified | |
| `README.md` · `AGENTS.md` · `docs/{architecture,data-layer,integration,messaging,testing}.md` · `docs/guides/{aws-setup,redis-setup}.md` | modified | 이용 전환 · QR 링크 · 문 열림 기록 · 사용중지 환불 · 이용 중 취소 동의 · `USER_WEB_URL` · Smoke 목록 |

## Tests Written
- user-service
  - `reservation-qr.spec.ts` — `[CASES:usage-transition]` 10개(시작 정각 · 시작 − 1초 · 끝 − 1초 · 끝 정각 · 이용 중 2 · 결제 대기 · 이용 완료 · 취소 · 만료 — 시작은 이용 중 쓰기 · 호실 · QR · Redis, 그 밖은 400 · 쓰기 없음), `[CASES:room-state]` 시작 5개(조건 `In(START_FROM)` 에 드는가), 이용 중 QR 3개, 경합 400 · 404 · 500 · 503 · 검증.
  - `reservation-cancel.spec.ts` — `[CASES:cancel-refund]` 12개(spec 10 + 비율 100% · 마감 0분), 사용중지 이용 중 취소(QR 끝 · Redis 마지막 · 호실 그대로) · 결제 대기 · 취소 불가 · 404 · 경합 · Redis 503 requeue · 검증 · 401.
  - `reservation-cancel-request.spec.ts`(새) — `[CASES:cancel-request]` 보이는 상태 5개, 응답 모양 · 환불 예정액(결제 끝난 구간만) · 404 2 · 검증.
  - `reservation-cancel-request-approve.spec.ts`(새) — 승인 가능 5개 · `[CASES:room-state]` 종료 4개, 전체 쓰기 값 · 순서(Redis 마지막), 확정 상태 승인, 404 2 · 상태 바뀜 3 · 경합 2 · Redis 503 · 검증 · 401.
  - `reservation-cancel-request-reject.spec.ts`(새) — 거절 가능 5개, 요청만 쓰기 · 404 3 · 경합 · 검증 · 401.
  - `reservation-payment-confirm.spec.ts` — 시작한 예약 → 이용 중 · 호실 · QR · setQr 순서 · 결과 CHECKED_IN, 시작 전 · 끝난 뒤는 확정만, 이용 중 전환 경합 400.
  - `reservation-list.spec.ts` · `reservation-detail.spec.ts` — `is_room_disabled`(상태 4 · 이용 중 사용중지).
  - `door-verify.spec.ts` — 이력 없음 → Redis 미호출 · ok false, 맞음 → 열림 기록 엔티티 값 · 순서, 틀림 · 503 → 기록 없음.
  - repository spec — `updateRoomQr` · `updateReservationRoom`(notDeleted) · `findLatestCancelRequest`(최근순) · `updateCancelRequest`(boolean) · 500, 내 예약 Smoke(`room_state_id` · 별칭 20), door `findDoorRoomQr` · `insertDoorOpenLog` · 500.
- admin-service
  - `reservation-use-cancel-request.spec.ts`(새) — `[CASES:cancel-request]` 만료 3개, 쓰기 값 · 순서 · SMS 문구, 확정 · 주소 끝 `/`, 주소 없음 503 · 404 2 · 이용 중 아님 5 · 번호 없음 · `[FAIL:duplicate]` · SMS 503 · 검증 3 · 401.
  - `reservation-store-cancel.spec.ts` — 시작 전만(시작 정각 · 시작 뒤 · 이용 중 · 결제 대기 시작 뒤 → 400), QR 단계 테스트 삭제.
  - `reservation-store.spec.ts` — 취소 요청 보이는 상태 5개 · 없으면 null.
  - repository spec — 만료 일괄 쓰기 · insert · 부분 유니크 400(다른 제약 · 그 밖 500) · 현황 Smoke(서브쿼리 3).
- scheduler `reservation.repository.spec.ts` — `startUsage` · `endUsage`(조건 쓰기 인자 · false · 500) · `claimQrLink` · `releaseQrLink`, Smoke 3개(시작 · 종료 · 링크 대상) + QR 동기화(이용 중만).
- crontab · 게이트웨이 · contracts 상수 · 시드는 plan 대로 spec 없음.

## Verification
- `npm run typecheck` · `npm run lint` · `npm run build`(4개 앱) · `npm run db:check`(마이그레이션 = 엔티티) 통과, 바뀐 파일 Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): 전체 108파일 1142건 통과. 첫 실행 실패는 Smoke SQL 고정값뿐(내 예약 select 의 `room_state_id`, 업체 현황 서브쿼리, QR 동기화 조건) — 실행 출력으로 채웠다.
  - Smoke 가 잡은 것: 업체 현황의 세 번째 서브쿼리는 고르는 컬럼이 정렬 컬럼(`created_at`)과 같아 TypeORM 이 `ORDER BY "c3_created_at"`(출력 별칭)로 쓴다 — PostgreSQL 은 ORDER BY 에 출력 별칭을 받으므로 맞는 SQL 이고, 그 모양을 고정했다.
- `docker compose -f compose.scheduler.yml config --quiet` 통과(임시 값 — `.env` 값은 보지도 출력하지도 않음).
- plan 대비 차이
  - `nextUsageRoomState(state, 'START' | 'END')` → `toEndedUsageRoomState(state)` — 시작 전환은 호실을 읽지 않고 상태 조건 쓰기(`In(START_FROM)`)라 START 갈래를 쓰는 곳이 없었다. 시작 쪽 `[CASES:room-state]` 는 조건에 든 상태로 확인한다.
  - admin `cancelRequestState` 는 보이는 상태 문자열만 돌려준다(승인 · 거절은 user-service).
  - scheduler `startUsage` · `endUsage` 는 util 이 만든 엔티티(`buildUsageStartTransition` · `buildUsageEndTransition`)를 받는다 — 기존 `transitionPending` 과 같은 방식. `claimQrLink` · `releaseQrLink` 도 `buildQrLinkSent` 엔티티를 받는다.
  - `USER_WEB_URL` 읽기는 util `readUserWebUrl()`(끝 `/` 제거) — admin · scheduler 에 같은 함수(앱끼리 import 하지 않는다).
  - 문 소켓 QR 확인에 `@Transactional()`(열림 기록 쓰기 — 쓰기가 있는 메서드 규칙).
  - 마이그레이션에서 예약 인덱스 2개의 같은 정의 재생성 줄을 뺐다(db:check 일치 확인).

## Remaining Issues
- 사용자(배포 — ship 때 로드맵 사용자 할 일에 정리)
  - `.env` 에 `USER_WEB_URL`(이용자 프론트 주소) — 비우면 QR 링크 SMS 를 보내지 않고 이용 중 취소 요청은 503.
  - 마이그레이션 `ReservationUsage` 적용 → user-service 재배포(요청 상태 시드), admin-service · scheduler 새 이미지(scheduler 에 AWS 키가 넘어간다 — SNS 권한).
  - 프론트: 예약 1건 화면(`/reservation/<id>` — QR 은 이용 중에만), 취소 동의 화면(`/reservation/<id>/cancel-request` — 로그인 후 승인 · 거절), 사용중지 전액 환불 취소 버튼(`is_room_disabled`), 업체 현황의 취소 요청 상태 · 이용 중 예약 취소 요청 버튼.
- crontab 은 운영(`NODE_ENV=production`)에서만 돈다 — 로컬에서 이용 전환 · 링크 SMS 를 보려면 scheduler 를 production 으로 띄운다.
- 정비중인 호실의 30분 안 즉시 예약은 지금 재고 판정대로 막힌다(정비 뒤 업체가 예약가능으로 바꿔야 풀린다) — spec 의 업무 규칙 그대로.

## Modification - 261108-1 (ship 리뷰 반영 — `main-review-261108.md` #1)
- Data-Access Smoke 6건 추가(코드 변경 없음, 테스트만):
  - user-service `door.repository.spec.ts` — `findDoorRoomQr`(findOne · 관계 컬럼 호실 · QR)
  - user-service `reservation.repository.spec.ts` — `findLatestCancelRequest`(findOne · 관계 컬럼 · 최근순) · `updateReservationRoom`(update · 관계 컬럼 상태 `IN` · 지워지지 않은 호실)
  - scheduler `reservation.repository.spec.ts` — `startUsage` · `endUsage`(예약 · 호실 update 조건) · `claimQrLink`(`IS NULL`)
  - update 조건은 `vi.spyOn(dataSource.manager, 'update')` 로 가로채 `createQueryBuilder().update().set().where()` 로 빌드(`buildUpdateQuery` 도우미) — docs/testing.md · AGENTS.md 에 방법 추가
- 확인: typecheck · lint 통과, 전체 108파일 1148건 통과.
