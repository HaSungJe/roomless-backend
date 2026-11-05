---
# One-line feature summary (e.g. "Admin user sign-up")
feature_goal: "이용자 업체 둘러보기(Phase 18) — 반경 업체 조회(지도 · 목록 공용) · 업체 상세 · 객실 그룹 목록, 예약 가능 시간을 그룹 → 시간대 → 호수로, 시간 이용 '지금 바로' 예약 + 결제 확인 때 QR 발급"

# Domain/module name (see AGENTS.md for the project directory structure)
domain: "discovery (user-service 새 도메인) + reservation (user-service 변경)"

# Entry-point method/endpoint. Record the entry-point identifier this project actually uses,
#   derived from code evidence (path:line), in the project's own naming. Do not assume a
#   particular position's syntax. (key name "api_method" stays as-is)
api_method: "GET (동기 · 로그인 없음) ×3 + GET 예약 가능 시간(모양 변경) + 큐 user.reservation.create(지금 바로) · user.reservation.payment-confirm(QR 발급)"

# Path/signature (e.g. "/api/v1/user/admin/sign")
#   Record the path or signature this project actually uses, from code evidence (path:line),
#   in the project's own naming. (key name "api_path" stays as-is)
api_path: "/api/v1/user-service/discovery/store · /store/:store_id · /store/:store_id/room-group (→ /internal/v1/user-service/discovery/…), /api/v1/user-service/reservation/availability · POST /api/v1/user-service/reservation · POST /api/v1/user-service/reservation/payment-confirm"

# Affected state — write/persist targets. Basis for sizing the test cases. (key name "affected_data" stays as-is)
#   Record the state this project actually writes/persists, derived from code evidence (path:line),
#   in the project's own naming. Read-only reads are not "write" but are still data. Leave empty if none.
affected_data:
  - "t_reservation · t_reservation_detail · t_payment — 지금 바로 예약(start_at = 지금 분 단위, 기존 쓰기 그대로)"
  - "t_room_qr — 결제 확인 때 이용이 시작된 예약의 QR 발급(INSERT … ON CONFLICT DO NOTHING)"
  - "Redis door-qr:<room_id> — 결제 확인 때 현재 QR 쓰기(setQr)"
  - "읽기 — t_store · t_store_file(STORE_IMAGE) · t_store_hour · t_store_break · t_room_plan(+ t_room_plan_type) · t_room_group · t_room_group_image · t_room_group_plan · t_room_group_plan_price · t_room"
---

## Feature Description

이용자가 앱(Next.js)에서 업체를 찾고 고르는 동선이다. 로그인 없이 연다.

1. **반경 업체 조회 (#74 · #75 합침)**: 지도를 열면 내 위치, 지도를 옮기면 그 지도 중심의 위경도와 반경(5 · 10 · 20 · 50km)으로 활성 업체를 가까운 순으로 받는다. 지도 마커와 목록 카드가 같은 응답을 쓴다. 각 업체 항목에 담는 것:
   - 거리 · 대표 사진
   - 영업중 여부 · 24시간 여부
   - 시간 이용 · 1박 최저가
2. **업체 상세 (#76)**: 소개 · 사진 · 연락처 · 영업시간 · 브레이크타임, 판매 중인 상품 설정과 환불 규정. 사업자 정보는 넣지 않는다.
3. **객실 그룹 목록 (#77)**: 그룹마다 담는 것:
   - 사진 · 상세정보(방 개수 · 샤워 · TV · PC)
   - 예약할 수 있는 호실 수
   - 판매 중인 상품의 기본 요금 · 남은 기간 가격
4. **예약 가능 시간 모양 변경**: 기존 `GET /api/v1/user-service/reservation/availability`(Phase 17)를 **객실 그룹 → 시간대 → 예약 가능한 호수 목록** 으로 바꾸고 그룹 필터를 더한다. 이용자는 그룹을 고른 뒤 시간대를 보고 그 시간대에 비어 있는 호수를 고른다. 재고 계산은 이 API 한 곳에만 있다.
5. **시간 이용 '지금 바로' 예약**: 지금(분 단위)을 이용 시작으로 하는 시간 이용 예약. 예약 가능 시간 API 의 오늘 날짜 맨 앞에 '지금 바로' 시간대(`is_now: 1`)가 나오고, 예약 생성은 `is_now: 1` 로 보낸다.
6. **결제 확인 때 QR 발급**: 결제가 확인된 예약이 이미 이용 시간 안이면(지금 바로 · 시작 뒤 결제) 그 자리에서 QR 을 발급하고 Redis 현재 QR 로 쓴다. 이용자는 확인 직후 문을 열 수 있다.

총관리자용 업체 목록은 위경도와 무관하게 이미 있다 — `GET /api/v1/admin-service/store`(관리자 가드, 상태 · 검색어 · 페이지 — Phase 9, `libs/contracts/src/store/dto/store-list.dto.ts:8`). 이번에 바꾸지 않는다.

## API Spec

### 1. 반경 업체 조회 (로그인 없음 · 동기)
- Method: `GET`
- Path: `/api/v1/user-service/discovery/store` → `/internal/v1/user-service/discovery/store`
- Request (query): `latitude` 위도(WGS84) · `longitude` 경도 · `radius_km` `5` | `10` | `20` | `50`
- Response `DiscoveryStoreListResultDto`:
  ```
  {
    list: [{store_id, store_name, address, latitude, longitude, distance_m,
            image_url | null, is_open, is_always_open,
            min_hourly_price | null, min_night_price | null}],
    is_truncated: 0 | 1
  }
  ```
  - 가까운 순(같은 거리는 store_id 순), 최대 300개. 더 있으면 `is_truncated: 1` 이다 — 프론트가 반경을 줄여 달라고 안내한다.
  - `image_url`: 업체 사진(STORE_IMAGE) 첫 장(정렬 순서 · 등록일)의 CloudFront 주소.
  - 최저가: 판매 중인 그룹 상품의 기본 요금 중 가장 낮은 값. 상품 종류별로 따로 둔다.

### 2. 업체 상세 (로그인 없음 · 동기)
- Method: `GET`
- Path: `/api/v1/user-service/discovery/store/:store_id` → `/internal/v1/user-service/discovery/store/:store_id`
- Request (param): `store_id` (32자 hex)
- Response `DiscoveryStoreDetailResultDto`:
  ```
  {
    store_id, store_name, phone, address, address_detail | null,
    latitude, longitude, introduction | null,
    is_open, is_always_open,
    booking_open_hours, refund_deadline_minutes, late_refund_percent,
    images: [{image_url, sort_order}],
    hours: [{day_of_week, is_closed, open_time | null, close_time | null}],
    breaks: [{start_time, end_time}],
    plans: [{room_plan_type_id, room_plan_type_name, days_of_week,
             usage_hours | null, check_in_time | null, check_out_time | null,
             min_nights | null, max_nights | null}]
  }
  ```
  - 시각은 `HH:mm`.
  - `plans` 는 업체가 파는 종류만 나오고, 시간 이용 → 1박 → 연박 순이다.

### 3. 객실 그룹 목록 (로그인 없음 · 동기)
- Method: `GET`
- Path: `/api/v1/user-service/discovery/store/:store_id/room-group` → `/internal/v1/user-service/discovery/store/:store_id/room-group`
- Request (param): `store_id`
- Response `DiscoveryRoomGroupListResultDto`:
  ```
  {
    list: [{
      room_group_id, room_group_name, description | null,
      room_group_detail: {room_count, has_shower, has_tv, has_pc},
      room_count,
      images: [{image_url, sort_order}],
      plans: [{room_plan_type_id, room_plan_type_name, price,
               period_prices: [{start_date, end_date, price, memo | null}]}]
    }]
  }
  ```
  - 그룹명 순이다.
  - `room_count` 는 예약을 받을 수 있는 호실 수(지워지지 않고 사용중지가 아닌 호실)다.
  - `period_prices` 는 끝 날짜가 오늘 이후인 것만 나오고, 시작 날짜 순이다.

### 4. 예약 가능 시간 (모양 변경 · 로그인 없음 · 동기)
- Method: `GET`
- Path: `/api/v1/user-service/reservation/availability` (그대로)
- Request (query): `store_id` · `date` · `room_plan_type_id` · `nights`(연박) — 그대로. 새로 `room_group_id`(선택 — 그 그룹만)
- Response `ReservationAvailabilityResultDto`:
  ```
  {
    room_plan_type_id, date, nights | null,
    list: [{
      room_group_id, room_group_name, price,
      slots: [{start_at, end_at, is_now,
               rooms: [{room_id, room_name, floor}]}]
    }]
  }
  ```
  - 그룹은 그룹명 순이다. 이 상품을 파는 그룹이면 시간대가 없어도 나온다(`slots: []`).
  - 시간대는 시작 순이고, 예약 가능한 호수가 1개 이상인 시간대만 나온다.
  - 호수는 층 · 호실명 순이다.
  - `price` 는 그룹 요금(그 날짜 · 박수의 기간 가격 반영)이다.
  - **바뀌는 점(Phase 17 대비)**: 응답 최상위가 호실 목록에서 그룹 목록으로 바뀌고, 금액이 호실에서 그룹으로 올라간다. 프론트가 아직 이 API 를 붙이지 않은 단계라 같이 바꾼다.

### 5. 예약 생성 — 지금 바로 (큐 경로 그대로)
- Method: `POST` `/api/v1/user-service/reservation` (`user.reservation.create`)
- Request: 기존 `ReservationDto` + `is_now?: 0 | 1`.
  - `is_now: 1` 이면 시간 이용 · 오늘 날짜(한국)만 받는다. `start_time` 은 보내지 않는다.
  - 서버가 지금(분 단위 내림)을 시작으로 쓴다.
- Response: 그대로(`ReservationResultDto` — `start_at` · `end_at` 에 지금 구간).

### 6. 결제 확인 — QR 발급 (큐 경로 그대로)
- Method: `POST` `/api/v1/user-service/reservation/payment-confirm` (`user.reservation.payment-confirm`)
- 입력 · 응답 그대로.
- 확정 뒤 그 예약이 이용 시간 안(`start_at ≤ 지금 < end_at`)이면 마지막 단계에서 QR 을 발급하고 Redis 현재 QR 로 쓴다.

## Business Rules

### 공개 대상 · 판매 판정
- **공개 대상 업체**: 활성(`ACTIVE`)이고 지워지지 않은 업체(로드맵 횡단 규칙 "업체 공개").
  - 영업중지 · 탈퇴 · 삭제 업체는 목록에서 빠지고 상세 · 그룹 목록은 404 `업체를 찾을 수 없습니다.` 다.
  - **영업중 아님(is_open 0) 업체는 보여 주되 `is_open: 0` 으로 표시**한다(사용자 결정 2026-11-06). 예약 가능 시간은 빈 시간대다(기존 규칙).
- **판매 중인 상품**: 업체 상품 설정 사용(`t_room_plan.is_used = 1`) · 그룹 상품 사용(`t_room_group_plan.is_used = 1`) · 요금 > 0 · 그 그룹에 예약 받을 호실(지워지지 않고 사용중지 아님)이 1개 이상. 기존 판정과 같은 기준이다(user-service reservation.util.ts:270 `isGroupPlanOnSale`, reservation.service.ts:117).

### 반경 업체 조회
- 서버는 지도 API(카카오 · 네이버)를 부르지 않는다. 프론트 지도 SDK 가 준 WGS84 좌표만 받는다(로드맵 #74 결정).
- **거리 = 대원 거리(haversine, 지구 반지름 6,371km)** 를 SQL 에서 계산한다(PostGIS 없음).
  - 먼저 반경을 덮는 위경도 사각형으로 거른다(기존 인덱스 `IDX_Store_LatitudeLongitude` — store.entity.ts:13).
  - 그다음 거리 ≤ 반경만 남긴다.
  - 사각형: 위도 폭 = 반경 / R, 경도 폭 = asin(sin(반경 / R) / cos(위도)) — 원의 가장 동서쪽 접점까지 덮는다.
  - 극에 닿으면 경도 전체로 한다. 경도 ±180 넘김은 다루지 않는다(국내 서비스).
- 반경은 5 · 10 · 20 · 50km 중 하나다(사용자 결정 2026-11-06 — 지도 중심이 바뀌면 같은 반경으로 다시 부른다).
- 최대 300개, 넘으면 `is_truncated: 1`(사용자 결정 2026-11-06 — 지도 · 목록 하나로 합침). 페이지 없음.
- 최저가는 기본 요금 기준이다(기간 가격 제외 — '~원부터' 용도, 사용자 결정 2026-11-06).

### 업체 상세
- 사업자 정보(대표자명 · 사업자등록번호)는 넣지 않는다(사용자 결정 2026-11-06).
- 업체코드 · 정지 사유 · 문 시크릿 여부 · 사업자등록증 · 정비시간도 빠진다.
- 사진은 업체 사진(STORE_IMAGE, 공개)만 CloudFront 주소로 나간다.

### 객실 그룹 목록
- 그룹 목록에 나오는 조건: 예약 받을 호실이 1개 이상이고 판매 중인 상품이 1개 이상인 그룹만.
- 상품은 시간 이용 → 1박 → 연박 순이다.
- 기간 가격은 그 상품의 지워지지 않고 끝 날짜 ≥ 오늘(한국)인 것만 나온다.
- 호실별 예약 가능 여부는 여기서 계산하지 않는다 — 날짜 · 상품을 고르면 예약 가능 시간 API(그룹 필터)를 부른다(사용자 결정 2026-11-06).

### 예약 가능 시간 (그룹 → 시간대 → 호수)
- 재고 판정은 그대로다(reservation.util.ts:308 `isStayBookable`): 영업중 · 사용중지 아님 · 시작 · 예약 가능 기간 · 즉시 입실은 예약가능 호실만 · 요일 · 영업시간 · 브레이크 · 일시 예약불가 · 점유 + 정비시간.
- 바뀌는 판정은 **시작 ≥ 지금**의 기준 하나다. 이제 지금을 분 단위로 내린 값과 비교한다 — '지금 바로' 구간의 시작이 지금 분이기 때문이다.
- `room_group_id` 가 오면 그 그룹의 호실만 본다. 업체에 없는 그룹이면 빈 목록이다.

### 지금 바로 (시간 이용만 — 사용자 결정 2026-11-06)
- 구간 = [지금(한국 시각, 분 단위 내림), + 업체 이용 시간).
  - 예: 이용 시간 240분 업체, 지금 2026-11-05 23:36 → 2026-11-05 23:36 ~ 2026-11-06 03:36.
  - 이 구간과 다음 것이 겹치면 예약 불가다: 다른 시간 이용 예약(예: 11-06 02:00 ~ 06:00), 1박 · 연박, 결제 대기 예약, 앞 예약의 정비시간, 브레이크, 일시 예약불가, 영업시간 밖(끝 포함).
  - 호실은 예약가능 상태만이다(기존 즉시 입실 규칙 — 시작이 지금부터 30분 안).
- 1박 · 연박에는 지금 바로가 없다(입실 시각 고정 그대로).
- 예약 가능 시간: 상품이 시간 이용이고 날짜가 오늘(한국)이면 '지금 바로' 시간대를 맨 앞에 둔다(`is_now: 1`). 다른 시간대는 30분 단위 그대로(`is_now: 0`).
- 예약 생성: `is_now: 1` 은 아래 둘이 맞을 때만 받는다. 판정은 같은 재고 판정이다.
  - 시간 이용만 — 아니면 400 `지금 바로 이용은 시간 이용만 예약할 수 있습니다.` (validation_errors.is_now)
  - 오늘 날짜만 — 아니면 400 `지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.` (validation_errors.date)
- 시작이 이미 지났으니 환불 마감 · 이용자 취소는 기존 규칙대로(시작 뒤 취소 불가)다. 업체 취소는 QR 을 끝낸다(Phase 15).

### 결제 확인 때 QR
- 확정(결제 DONE → 구간 → 예약 CONFIRMED) 뒤, 그 예약이 `start_at ≤ 지금 < end_at` 이면 QR 을 발급한다.
  - 발급은 `INSERT … ON CONFLICT DO NOTHING` 뒤 다시 읽는다 — 내 예약 QR · scheduler 와 같은 방식이다(유효 = 이용 시작 ~ 끝, QR 32자 무작위).
  - 그다음 Redis 현재 QR 을 쓴다(`setQr`, PXAT = 유효 끝). 외부 단계라 명령의 마지막이다.
- 발급 뒤 다시 읽어도 없으면 500, Redis 실패는 503 이다. 큐 재시도로 확정 전체를 다시 하고, 토스 조회는 멱등이다.
- 시작 전 예약은 지금처럼 이용 시작 때 scheduler · 내 예약 QR 이 발급한다.
- QR 엔티티 조립은 util `buildRoomQr` 하나로 모은다. 내 예약 QR 발급(reservation.service.ts:515)도 이걸 쓴다.

## Notes
- **위치**: user-service 새 도메인 `discovery`(사용자 결정 2026-11-06 — 이용자 서버, 예약 가능 시간 API 와 같은 서버).
  - 공유 DB 를 discovery 어휘로 직접 읽는다(로드맵 결정 "예약 · 조회가 객실 데이터를 읽는 방법").
  - 사진 공개 주소를 위해 user-service 루트 모듈이 `StorageModule` 을 import 한다. 쓰는 것은 `getPublicUrl` 뿐이다.
  - compose 는 `.env` 를 그대로 넘기므로 `AWS_S3_PUBLIC_URL` 이 이미 닿는다(compose.user-service.yml — AWS 값을 빈 값으로 덮지 않음).
- **공개 라우트**: 가드 없음(AGENTS "인증 없는 공개 라우트" 에 discovery 3개 추가). 서비스 쪽 전역 InternalAuthGuard 는 그대로다.
- **캐시**: 하지 않는다 — Phase 23 #97 이 `t_api_log.duration_ms` 로 측정한 뒤 정한다(로드맵).
- **로드맵 변경(제안)**:
  - #74 → "반경 업체 조회", #75 → dropped(#74 에 합침), #77 → 그룹 정보만.
  - 새 유닛 2개: #116 예약 가능 시간 그룹 → 시간대 → 호수, #117 시간 이용 지금 바로 예약 + 결제 확인 때 QR.
  - 파일 집합을 user-service 로 바꾼다.
- **형제 근거**:
  - 업체 상세는 매니저 `getMyStore`(admin-service store.service.ts:693 — 영업시간 · 브레이크 · 파일 주소)를 따른다.
  - 그룹 목록은 매니저 `getMyRoomGroup`(room.service.ts:233 — 사진 · 그룹 상품)을 따른다.
  - 쿼리는 `buildRoomGroupRowsQuery`(room.repository.ts:221 — 서브쿼리 · raw select)를 따른다.
  - 공개 동기 라우트는 예약 가능 시간(gateway reservation.controller.ts:41 — 가드 없음 · Query DTO 생성자)을 따른다.

## Proposals (Codebase-Based)
- [x] 지도 · 목록을 하나의 반경 API 로(사용자 결정 2026-11-06).
- [x] 호실별 예약 가능 여부는 예약 가능 시간 API 를 그룹 → 시간대 → 호수로 바꿔 재사용(사용자 결정 2026-11-06 — 재고 계산 한 곳).
- [x] 결제 확인 때 이용이 시작된 예약은 QR 바로 발급(사용자 요청 2026-11-06).
- [x] QR 엔티티 조립 util 하나로(내 예약 QR · 결제 확인 — 서비스 private 헬퍼 금지 규칙).

## Decisions
- [x] 서버 위치 — user-service `discovery` (사용자 결정 2026-11-06)
- [x] 시간대별 호수 목록 위치 — 예약 가능 시간 API 모양 변경 + `room_group_id` 필터 (사용자 결정 2026-11-06)
- [x] 지금 바로 범위 — 시간 이용만, 지금(분) ~ + 이용 시간, 겹치면 불가 (사용자 결정 2026-11-06)
- [x] 영업중 아님 업체 — 보여 주되 `is_open: 0` (사용자 결정 2026-11-06)
- [x] 목록 최저가 — 시간 이용 · 1박 따로, 기본 요금 기준 (사용자 결정 2026-11-06)
- [x] 반경 — 5 · 10 · 20 · 50km, 지도 · 목록 하나, 최대 300개 + `is_truncated` (사용자 결정 2026-11-06)
- [x] 업체 상세 사업자 정보 — 넣지 않음 (사용자 결정 2026-11-06)
- [x] TDD — `[CASES:now-stay]` 12 · `[CASES:radius-box]` 5 (사용자 결정 2026-11-06)
- [x] 총관리자용 업체 목록 — 기존 `GET /api/v1/admin-service/store`(좌표 무관) 그대로 (사용자 확인 2026-11-06)
