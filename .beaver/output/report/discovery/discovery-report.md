# Report — discovery

## Feature Summary
- **Feature**: 이용자 업체 둘러보기(Phase 18). 세 가지를 만들고 예약 쪽 세 가지를 바꿨다.
  - 새 API(로그인 없음)
    - 반경 업체 조회: 지도 중심 + 5 · 10 · 20 · 50km, 가까운 순 최대 300개, 지도 · 목록 공용
    - 업체 상세: 사업자 정보는 넣지 않는다
    - 객실 그룹 목록
  - 예약 쪽 변경
    - 예약 가능 시간 응답을 객실 그룹 → 시간대 → 예약 가능한 호수로 바꾸고 그룹 필터를 더했다
    - 시간 이용 '지금 바로' 예약: 지금(분 단위 내림)부터 이용 시간만큼
    - 결제 확인 때 이미 이용 시간 안인 예약은 QR 을 바로 발급한다
- **Entry point**
  - 새 공개 3개: `GET /api/v1/user-service/discovery/store` · `/store/:store_id` · `/store/:store_id/room-group` → `/internal/v1/user-service/discovery/…`
  - 변경: `GET /api/v1/user-service/reservation/availability`(응답 모양 · `room_group_id`), `user.reservation.create`(`is_now`), `user.reservation.payment-confirm`(QR 발급)
- **Domain**: user-service `discovery`(새) · `reservation`(변경), gateway `api/v1/user-service/discovery`(새). 로드맵 Phase 18 의 #74 · #76 · #77 · #116 · #117 이고, #75 는 #74 에 합쳤다.
- **Plan**: [discovery-plan.md](../../plan/discovery/discovery-plan.md) · **Spec**: [discovery-spec.md](../../spec/discovery/discovery-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/contracts/src/discovery/discovery.commands.ts` · `dto/discovery-store-list.dto.ts` · `dto/discovery-store-detail.dto.ts` · `dto/discovery-room-group-list.dto.ts` | created | 내부 경로 3개 · 반경 query(위경도 `@IsLatitude/@IsLongitude` · 반경 `@IsIn`) · 상세 · 그룹 목록 param · 결과 |
| `libs/contracts/src/reservation/dto/reservation-availability.dto.ts` | modified | `room_group_id` 필터. 결과는 그룹(`price`) → 시간대(`is_now` · `rooms`) → 호수(`room_id` · `room_name` · `floor`) |
| `libs/contracts/src/reservation/dto/reservation.dto.ts` | modified | `is_now`(0/1, 선택). `start_time` 은 시간 이용이면서 지금 바로가 아닐 때만 필수 |
| `apps/user-service/src/discovery/` (symbols · constants · interfaces · repositories · util · service · controllers · module) | created | 아래 세 줄 참고 |
| ↳ repository | | 반경 업체 QueryBuilder — haversine 거리 select · where, 위경도 사각형 BETWEEN, 대표 사진 · 상품 종류별 최저가 서브쿼리 |
| ↳ repository | | 그룹별 예약 받을 호실 수(GROUP BY) · 상품 설정 + 종류명 · find 8개(notDeleted · 정렬) |
| ↳ util · service | | util 은 `toRadiusBox` · 응답 조립. service public 은 3개다 |
| `apps/user-service/src/user-service.module.ts` | modified | `StorageModule`(공개 주소만) · `DiscoveryModule` |
| `apps/user-service/src/reservation/reservation.util.ts` | modified | `Stay.is_now` · `toNowStay` 를 더했다 |
| ↳ 같은 파일 | | 시작 비교를 분 단위로(`now.startOf('minute')`) 바꿨다 |
| ↳ 같은 파일 | | `toAvailabilityGroups` · `toAvailabilityRoom` · `toSlot(stay, rooms)` · `buildRoomQr` · `isReservationStarted` 를 더하고 `toAvailabilityRooms` 는 지웠다 |
| `apps/user-service/src/reservation/reservation.service.ts` | modified | 예약 가능 시간: 그룹 필터 · 오늘 시간 이용이면 지금 바로 · 그룹 응답 |
| ↳ 같은 파일 | | 예약 생성: `is_now` 판정 · 지금 구간 |
| ↳ 같은 파일 | | 결제 확인: 6단계 QR 발급 + `setQr`(마지막) |
| ↳ 같은 파일 | | 내 예약 QR: `buildRoomQr` 사용 |
| `apps/user-service/src/reservation/reservation.constants.ts` | modified | `RESERVATION_QR_ISSUE_FAILED_MESSAGE`(두 곳이 쓴다) |
| `apps/user-service/src/reservation/controllers/reservation.controller.ts` · `apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.ts` | modified | 예약 가능 시간 주석 · summary("객실 그룹별 예약 가능 시간") |
| `apps/gateway/src/api/v1/user-service/discovery/` (controllers · module) · `apps/gateway/src/gateway.module.ts` | created · modified | 공개 라우트 3개(가드 없음 · Swagger "업체 둘러보기") |
| `apps/user-service/src/discovery/test/` (helper + spec 4) | created | 아래 Tests Written |
| `apps/user-service/src/reservation/test/reservation-availability.spec.ts` · `reservation-create.spec.ts` · `reservation-payment-confirm.spec.ts` | modified | 새 응답 모양 · 지금 바로 · 결제 확인 QR |
| `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/integration.md` · `docs/testing.md` | modified | 공개 경로 · user-service 설명 · 트리 · 인증 없는 공개 라우트 · Query DTO 목록 · 공개 주소 사용처 · Smoke 목록 |

삭제한 코드:
- `toAvailabilityRooms`(그룹 단위로 바뀜)
- 내 예약 QR 의 인라인 QR 엔티티 조립 · 인라인 실패 메시지
- 예약 가능 시간 응답의 호실 단위 `price` · `room_group_id` · `room_group_name` · `slots`

## Tests Written
- `[CASES:now-stay]` 12개(reservation-availability.spec — 이용 시간 240분, 지금 2026-11-05 23:36:27):
  - 가능: 비어 있음 → 23:36 ~ 03:36(초는 버림), 03:36 맞닿음(정비 0), 연도 경계 23:50 ~ 03:50
  - 불가 — 예약과 겹침: 02:00 ~ 06:00 확정 예약, 앞 예약 점유 끝(정비 포함), 같은 호실 1박, 결제 대기 예약
  - 불가 — 호실 · 업체 조건: 정비중 호실, 영업시간 18 ~ 02시, 브레이크 01 ~ 02시, 일시 예약불가, 영업중 아님
  - 여기에 더해 오늘이 아닌 날짜 · 1박이면 지금 바로 시간대가 없다.
- `[CASES:radius-box]` 5개(discovery-store-list.spec):
  - 서울 5 · 50km, 제주 20km, 적도 10km 를 소수 6자리까지 맞춘다.
  - 서울 50km 사각형이 원을 모두 덮는지: 꼭짓점 거리 ≥ 반경, 원 위의 점 36개가 범위 안.
- `[CASES:availability]` 기존 14개는 새 모양(그룹의 시간대 · 그룹 금액)으로 그대로 통과한다.
- 예약 가능 시간:
  - 응답 모양
  - 그룹 2개 · 호실 2개: 그룹명 순, 점유된 시간대는 102호만
  - `room_group_id` 필터(조회 조건까지) · 업체에 없는 그룹 · 영업중 아님
  - 검증: `room_group_id`
- 예약 생성 — 지금 바로:
  - 10:21:45 → 10:21 ~ 13:21, 점유 끝 · 환불 마감
  - 1박 400(is_now) · 다른 날짜 400(date) · 겹침 400
  - 검증: is_now 2, 지금 바로 + 시작 시각 없음 → 통과
- 결제 확인 QR:
  - 이용 시작 뒤면 insertRoomQr(RoomQrEntity 값) → findRoomQr → setQr(호실 · QR · 끝), 순서까지 단언
  - 시작 전이면 발급 없음
  - Redis 503 은 requeue, 다시 읽어도 없음은 500 → requeue(setQr 없음)
- discovery 상세:
  - 공개 필드 전체를 toEqual 로 확인한다(사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 · 정비시간 없음).
  - 사진 주소 · HH:mm, 사용 중인 상품만 순서대로, 조회 조건.
  - 영업중 아님도 보인다 · 404 · store_id 400.
- discovery 그룹 목록:
  - 그룹명 순 · 호실 0 그룹 제외 · 판매 중인 상품만(미사용 · 요금 0 · 업체가 안 파는 종류 제외) · 기간 가격 · 사진
  - 조회 조건: 끝 날짜 ≥ 한국 오늘 — 서버가 UTC 11-05 일 때도 11-06 으로 본다
  - 건너뜀 3가지 · 404 · 검증
- discovery 반경 목록:
  - 사진 주소 · null, 301개 요청 · 300개 + 잘림
  - 빈 목록 · 검증 3가지 · 내부 토큰 403
- discovery.repository.spec:
  - notDeleted · 정렬 · loadRelationIds 조건, 통일 500(find 8 · 빌더 3)
  - `[SMOKE:data-access]` 반경 업체 · 그룹별 호실 수 · 상품 설정 SQL 고정 + find 조건 8가지
- 게이트웨이 · 서비스 controller · 모듈 등록 · 경로 상수는 plan 대로 spec 이 없다(위임형).

## Verification
- `npm run typecheck` · `npm run lint`(경고 0) · `npm run build` · `npm run db:check`(엔티티 변경 없음 — 일치)가 통과했다. 바뀐 ts 는 Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): 전체 101파일 996건 통과.
  - 처음 실행에서 실패한 것은 두 가지뿐이었다.
    - Smoke 자리표시자 3개: 실행 출력으로 채웠다. SQL 을 읽어 haversine · 사각형 · 서브쿼리 · 파라미터 재사용($1 · $2 · $5)이 설계대로인지 확인했다.
    - 생성 spec 의 is_now 검증 케이스 하나: 입력에 시작 시각이 없어 오류가 2개 나왔다. 시작 시각이 있는 입력으로 고쳤다.
  - `[CASES:now-stay]` 12개는 처음부터 통과했다. 기존 재고 판정이 자정을 넘는 영업시간 · 브레이크(입실 전날 ~ 퇴실일 창)를 이미 다룬다.
- plan 대비 차이:
  - 그룹 목록 spec 의 그룹 상품 ID 를 명시 상수로 바꿨다(도우미가 만든 ID 가 겹칠 수 있었다).
  - 결제 확인 spec 은 문 정보 mock 을 넘기도록 부팅을 바꿨다.
  - 지금 바로 · 1박 케이스는 1박 시간대가 실제로 1개 있는 업체(24시간)로 확인한다.

## Remaining Issues
- **사용자 — 프론트**:
  - 예약 가능 시간 응답이 그룹 → 시간대 → 호수로 바뀐다. 금액은 그룹 `price`, 지금 바로는 `is_now: 1` 시간대다.
  - 지금 바로 예약은 `is_now: 1`(시작 시각 없이, 오늘 날짜).
  - 업체 둘러보기 API 3개를 쓴다. 지도를 옮기면 중심 + 같은 반경으로 다시 부르고, `is_truncated` 면 반경을 줄이라고 안내한다.
- **사용자 — 배포**: user-service 를 새 이미지로 다시 띄운다. 사진 주소를 위해 user-service 에도 `AWS_S3_PUBLIC_URL` 이 닿아야 한다. compose 는 `.env` 를 그대로 넘기니 같은 `.env` 면 된다. 마이그레이션은 없다.
- 거리 계산(haversine)은 SQL 이라 실제 결과는 DB 에서만 확인된다. 서울에서 알려진 두 지점의 거리 같은 실데이터 확인은 사용자 몫이다. 반경 300개가 넘는 밀집 지역의 응답 시간은 Phase 23 #97(캐시 · 측정)에서 본다.
