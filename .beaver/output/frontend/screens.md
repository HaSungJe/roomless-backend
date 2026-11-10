# 화면 목록 · 화면 구성과 쓰는 API

시안은 아티팩트 3개(이용자 화면 · 업체 관리자 콘솔 · 관리자 콘솔 — 링크는 [README](README.md))에 있다. 시안 안 화면 이름이 아래 **키 · 주소**와 같다. API 상세(방식 · 로그인 · 요청 · 응답 DTO)는 [api.md](api.md), 필드는 [dto/](dto/).

## 화면 목록

| 키 | 주소 | 화면 | 로그인 |
|---|---|---|---|
| U1 | `/` | 지도 · 주변 업체 | 공개 |
| U2 | `/stores/[store_id]` | 업체 상세 + 객실 그룹 | 공개 |
| U3 | `/stores/[store_id]/booking` | 예약(상품 · 날짜 · 시간대 · 호수 고르기) | 조회 공개 · 예약은 이용자 |
| U4 | `/payments/success` · `/payments/fail` | 결제 결과 | 이용자 |
| U5 | `/login` · `/signup` · `/phone-verification` · `/find-login-id` | 로그인 · 가입 · 휴대폰 인증 · 아이디 찾기 | 공개(휴대폰 인증은 이용자) |
| U6 | `/reservation` | 내 예약 목록 | 이용자 |
| U7 | `/reservation/[reservation_id]` ★ | 예약 1건(상세 · QR · 취소 · 연장으로) | 이용자 |
| U8 | `/reservation/[reservation_id]/cancel-request` ★ | 이용 중 취소 동의 | 이용자 |
| U9 | `/reservation/[reservation_id]/extension` | 연장 | 이용자 |
| U10 | `/me` | 마이페이지(탈퇴 · 철회 · 로그아웃) | 이용자 |
| U11 | `/store-applications` · `/store-applications/new` · `/store-applications/[store_application_id]` | 입점 신청 | 이용자 |
| M1 | `/manager/[store_code]/login` · `/manager/[store_code]/find-login-id` · `/manager/[store_code]/password-reset` · `/manager/login`(업체 로그인 주소 안내) · `/manager/password` | 로그인 · 아이디 찾기 · 비밀번호 초기화 · 비밀번호 변경 — 업체코드는 주소에 | 공개(변경은 매니저) |
| M2 | `/manager` | 대시보드(내 업체 통계) | 매니저 |
| M3 | `/manager/reservations` | 예약 현황 | 매니저 |
| M4 | `/manager/rooms` | 호실 | 매니저 |
| M5 | `/manager/room-groups` · `/manager/room-groups/[room_group_id]` | 객실 그룹(사진 · 그룹 상품 · 기간 가격) | 매니저 |
| M6 | `/manager/plans` | 업체 상품 설정 | 매니저 |
| M7 | `/manager/store` | 내 업체 설정 | 매니저(문 시크릿은 업체 총관리자) |
| M8 | `/manager/staff` · `/manager/staff/[user_id]` | 업체 관리자 관리 | 업체 총관리자 |
| A1 | `/admin/login` · `/admin/password` | 로그인 · 비밀번호 변경 | 공개(변경은 관리자) |
| A2 | `/admin` | 대시보드(전체 통계) | 관리자 |
| A3 | `/admin/store-applications` · `/admin/store-applications/[store_application_id]` | 입점 신청 관리 | 관리자 |
| A4 | `/admin/stores` · `/admin/stores/[store_id]` | 업체 관리 | 관리자 |
| A5 | `/admin/managers` · `/admin/managers/[user_id]` | 업체 관리자 계정 | 관리자 |
| A6 | `/admin/users` · `/admin/users/[user_id]` | 이용자 관리 | 관리자 |

★ 고정 주소 — 백엔드가 보내는 SMS 링크가 연다(`<이용자 화면 주소>/reservation/<예약 ID>` · `…/cancel-request`). 주소를 바꾸지 않는다. 로그인이 안 돼 있으면 로그인 뒤 그 주소로 돌아온다.

## 영역 공통

- **로그인 토큰은 영역마다 따로** 저장한다 — 이용자(`/`) · 매니저(`/manager`) · 관리자(`/admin`). 다른 영역 토큰은 401 이다.
- 로그인이 필요한 화면에서 401 이면 그 영역의 재발급 API 로 한 번 재발급하고 다시 부른다. 또 401 이면 그 영역 로그인 화면으로(돌아올 주소를 들고).
- 로그아웃 API 는 없다 — 저장한 토큰을 지운다.
- 큐 API(api.md "방식" 이 큐)는 `done` 이 오면 성공, `failed` 면 `message`(입력 칸 오류는 `validation_errors`)를 띄우고, `pending` 이면 그 화면의 조회 API 를 다시 부른다.
- 목록 화면은 `page` · `size` 로 넘기고 응답 `pagination`(총 개수 · 마지막 페이지 · 페이지 탭 범위)으로 페이지 탭을 그린다. 고르기 상자처럼 전부 필요하면 `all_search_yn=Y`.

---

## 이용자 `/` — 모바일 웹

### U1 지도 · 주변 업체 — `/`
- 시안: 이용자 화면 › `U1 지도 · 주변 업체`
- 구성: 지도(업체 마커 — `latitude` · `longitude`) · 반경 고르기(5 · 10 · 20 · 50km) · 업체 목록 카드(대표 사진 `image_url` · `store_name` · 거리 `distance_m` · `address` · 영업중 `is_open` · 24시간 `is_always_open` · 시간 이용 최저가 `min_hourly_price` · 1박 최저가 `min_night_price`) · 상단 로그인 / 내 예약 진입
- 들어올 때: 위치 권한 → 내 위치(거부면 기본 위치) → `GET /api/v1/user-service/discovery/store`(`latitude` · `longitude` · `radius_km`)
- 동작
  - 지도를 움직이고 멈추면 → 지도 중심 + 같은 반경으로 같은 API 를 다시 부른다.
  - 반경을 바꾸면 → 다시 부른다.
  - 카드 · 마커를 누르면 → U2.
- 화면 주의: `is_truncated` 1 이면 업체가 300곳을 넘어 일부만 온 것 — "반경을 줄여 주세요" 안내. 최저가가 `null` 이면 그 상품을 팔지 않는 업체다.

### U2 업체 상세 + 객실 그룹 — `/stores/[store_id]`
- 시안: 이용자 화면 › `U2 업체 상세`
- 구성: 사진 넘기기(`images`) · 이름 · 영업중 · 주소 · 전화 · 소개 · 지도 위치 · 영업시간(`hours` 요일별, `is_always_open` 1 이면 24시간) · 브레이크(`breaks`) · 판매 상품(`plans` — 시간 이용 이용 시간 `usage_hours`, 1박 입퇴실 `check_in_time` · `check_out_time`, 연박 `min_nights` ~ `max_nights`, 연장 가능 `is_extendable` · `max_extensions`) · 예약 · 환불 규정(`booking_open_hours` · `refund_deadline_minutes` · `late_refund_percent`) · 객실 그룹 카드(사진 · 이름 · 설명 · 편의시설 `room_group_detail` · 예약 받는 호실 수 `room_count` · 상품별 가격 `plans[].price` + 기간 가격 `period_prices`) · 하단 "예약하기"
- 들어올 때: 두 API 를 함께 부른다.
  - `GET /api/v1/user-service/discovery/store/:store_id` — 업체 정보
  - `GET /api/v1/user-service/discovery/store/:store_id/room-group` — 객실 그룹 목록
- 동작: "예약하기" · 객실 그룹 카드 → U3(고른 상품 · 그룹을 쿼리로 넘겨도 된다).
- 화면 주의: 404 면 "업체를 찾을 수 없습니다" 후 U1. 기간 가격(`period_prices`)이 있는 날은 그 가격이 기본 가격 대신 쓰인다.

### U3 예약 — `/stores/[store_id]/booking`
- 시안: 이용자 화면 › `U3 예약(고르기)` · `U3 예약(결제 대기)`
- 구성: 업체 이름 → 상품 탭(업체 `plans` 중 판매하는 것) → 날짜 **달력**(월 단위 · 이전 / 다음 달, 처음엔 오늘이 선택됨, 지난 날 · 아직 예약이 열리지 않은 날(오늘부터 `booking_open_hours` 뒤) · 그 상품을 팔지 않는 요일(`days_of_week`)은 고를 수 없게 흐리게, 연박이면 박수 `nights`) → 객실 그룹 **옆으로 넘기는 카드**(한 번에 한 장만 보이고 양옆에 여백 · 카드 아래 가운데에 이전 버튼 · "1 / 3"(지금 위치 / 전체) · 다음 버튼, 카드 = 대표 사진 · `room_group_name` · 예약할 수 있는 시간 수(`slots` 개수) · `price`, 시간이 없는 그룹은 흐리게) → 시간대 칩(`slots` — `start_at` ~ `end_at`, 첫 칸 `is_now` 1 이면 "지금 바로") → 호수 목록(`rooms` — `room_name` · `floor`) → 하단 금액 · "예약하기"
- 들어올 때: `GET /api/v1/user-service/discovery/store/:store_id` 로 판매 상품 · 영업시간을 받아 상품 · 날짜 고르기를 그린다.
- 동작
  - 상품 · 날짜(· 박수 · 그룹 거르기)를 고르면 → `GET /api/v1/user-service/reservation/availability`(`store_id` · `date` · `room_plan_type_id` · `nights` · `room_group_id`) → 그룹 → 시간대 → 호수 순으로 고른다.
  - "예약하기"(로그인 필요 — 안 돼 있으면 U5 뒤 이 화면으로) → `POST /api/v1/user-service/reservation`(큐 — `room_id` · `room_plan_type_id` · `date` · 시간 이용이면 `start_time`(HH:mm, 시간대 시작) 또는 `is_now` 1 · 연박이면 `nights`)
    - done → `payment_id` · `order_name` · `amount` 로 토스 결제창을 연다(orderId = `payment_id`). 결제 마감은 `expires_at`(5분) — 남은 시간을 보여 준다.
    - failed 400(그 사이 다른 예약이 잡힘 · 결제 대기 만료 뒤 10분 안에 같은 호실 · 이용 제한 등) → `message` 를 띄우고 availability 를 다시 부른다.
- 화면 주의: 회원 상태가 이용 제한(BLOCK) · 탈퇴 대기(LEAVE_WAIT)면 "예약하기"를 막고 안내한다(로그인 결과의 `state_id` — 서버도 400). 시간 이용 시작 시각은 30분 단위다.

### U4 결제 결과 — `/payments/success` · `/payments/fail`
- 시안: 이용자 화면 › `U4 결제 성공` · `U4 결제 실패`
- 구성: 처리 중 표시 → 결과(예약 번호 · 상태) · "예약 보기" / 실패 사유 · "다시 고르기"
- 동작
  - success: 토스가 붙여 준 `paymentKey` · `orderId` · `amount` → 프론트 서버(Next.js 라우트)가 토스 결제 승인 API 를 부른다 → 화면이 `POST /api/v1/user-service/reservation/payment-confirm`(큐 — `payment_id` = orderId · `payment_key` = paymentKey)
    - done `reservation_state_id` CONFIRMED → U7. CHECKED_IN(이미 시작한 예약 — 지금 바로 · 연장) → U7(바로 QR).
    - failed 400 + `payment_error_code` → 안내 후 U3(5분이 지나 만료됐으면 다시 예약).
  - fail: 토스 오류 문구 → U3(연장이면 U9).
- 화면 주의: 연장 결제도 같은 성공 · 실패 주소와 같은 결제 확인 API 를 쓴다(orderId 가 연장 구간의 `payment_id`).

### U5 로그인 · 가입 · 휴대폰 인증 · 아이디 찾기 — `/login` · `/signup` · `/phone-verification` · `/find-login-id`
- 시안: 이용자 화면 › `U5 로그인` · `U5 가입` · `U5 휴대폰 인증` · `U5 아이디 찾기`
- 구성: 로그인(카카오 · 네이버 버튼) · 가입 추가 정보(성별 `gender` · 생년월일 `birth` · 닉네임 `nickname`) · 휴대폰 인증(번호 → 인증번호) · 아이디 찾기(번호 → 인증번호 → 가입한 SNS · 가입일)
- 동작
  - SNS 로그인을 끝내고 → `POST /api/v1/user-service/user/login`(`sns_id` KAKAO · NAVER · `sns_user_id`)
    - 성공 → 토큰 저장. `is_phone_verified` 0 이면 `/phone-verification`, 아니면 돌아갈 주소로.
    - 404 "잘못된 로그인 정보입니다."(가입하지 않은 SNS 계정) → `/signup` → `POST /api/v1/user-service/user/sign`(큐 — `sns_id` · `sns_user_id` · `gender` · `birth` · `nickname`) → done 토큰 저장 → `/phone-verification`.
  - 휴대폰 인증: `POST /api/v1/user-service/user/phone-verification`(큐 — `phone`) → done `sms_verification_id` · `expires_at` → 인증번호 입력 → `POST /api/v1/user-service/user/phone-verification/confirm`(큐 — `sms_verification_id` · `code`) → done 이면 인증 완료.
  - 아이디 찾기: `POST /api/v1/user-service/user/find-login-id`(큐 — `phone`) → `POST /api/v1/user-service/user/find-login-id/confirm`(큐 — `sms_verification_id` · `code`) → done `sns_id`(가입한 SNS) · `created_at` 을 보여 준다.
  - 재발급: 이용자 영역 401 이면 `POST /api/v1/user-service/user/token-refresh`(`refresh_token`).
- 화면 주의
  - 서버는 SNS 토큰을 다시 확인하지 않고 넘긴 `sns_user_id` 를 믿는다 — SNS 로그인을 끝낸 뒤 그 사용자 ID 만 넘긴다.
  - 가입은 성인만 — 만 19세가 되는 해의 1월 1일부터(생일은 보지 않는다). 미성년이면 400 이고 `validation_errors` 의 `birth` 칸 오류로 온다.
  - 로그인 결과 `state_id` BLOCK 이면 `block_comment` 로 이용 제한 안내 띠, LEAVE_WAIT 이면 `leave_reserved_at`(탈퇴 예정 시각)으로 탈퇴 철회 안내(U10) — 둘 다 로그인은 되고 예약 · 연장만 막힌다.
  - 인증번호: 틀리면 400 "인증번호가 일치하지 않습니다." · 횟수 초과 · 만료면 다시 요청 · 하루 발송 한도가 있다(메시지 그대로).
  - 로그인 뒤 회원 상태 · 휴대폰 인증 여부가 바뀔 수 있으니(관리자의 이용 제한 · 해제, 휴대폰 인증, 탈퇴 신청 · 철회) 앱을 다시 열 때와 U10 에서 `GET /api/v1/user-service/user/me` 로 다시 읽는다.

### U6 내 예약 목록 — `/reservation`
- 시안: 이용자 화면 › `U6 내 예약` · `U6 내 예약(없음)`
- 구성: 예약 카드(`store_name` · `room_group_name` · `room_name` · `room_plan_type_name` · 상태 `reservation_state_name` · `start_at` ~ `end_at` · `total_price` · 사용중지 호실 표시 `is_room_disabled`) · 페이지
- 들어올 때: `GET /api/v1/user-service/reservation`(`page` · `size`)
- 동작: 카드 → U7.

### U7 예약 1건 — `/reservation/[reservation_id]` ★
- 시안: 이용자 화면 › `U7 예약 1건(결제 대기)` · `U7 예약 1건(이용 전)` · `U7 예약 1건(이용 중 · QR)` · `U7 예약 1건(취소됨)`
- 구성: 상태 띠(`reservation_state_name`) → 업체 · 그룹 · 호실 · 상품 · `start_at` ~ `end_at` · `total_price` → 구간 목록(`segments` — 기본 · 연장, 구간마다 금액 · 결제 상태 `payment.payment_state_name` · 영수증 `receipt_url` · 환불 `refund_amount`) → 환불 안내 → 버튼 줄(QR 확인 · 취소 · 연장)
- 들어올 때: `GET /api/v1/user-service/reservation/:reservation_id`
- 동작
  - 상태가 CHECKED_IN(이용 중)이면 → `GET /api/v1/user-service/reservation/:reservation_id/qr` → `qr`(32자)을 QR 이미지로 그려 `qr_ends_at` 까지 보여 준다. 시작 전 · 끝난 뒤에는 부르지 않는다(시작 전은 400).
  - "취소" → 사유 입력 → `PATCH /api/v1/user-service/reservation/:reservation_id/cancel`(큐 — `cancel_reason`) → done `refund_amount` 안내 → 상세를 다시 부른다.
  - "연장"(이용 중일 때) → U9.
  - 결제 대기(PENDING)면 "결제하기" → 그 구간 `payment.payment_id` · `amount` 로 토스 결제창(주문명은 업체 · 호실 이름으로 만든다), 마감 `expires_at`.
- 화면 주의
  - 환불 안내: `refund_deadline_at` 전 취소는 전액, 뒤는 `late_refund_percent`% 환불. `is_room_disabled` 1(호실이 사용중지)이면 이용 중이어도 끝 전까지 전액 환불 취소.
  - QR 확인 SMS(이용 시작 5분 전)가 이 주소를 연다 — 아직 이용 전이면 "시작 시각부터 QR 이 열립니다" 와 남은 시간을 보여 주고, 시작 시각에 상세를 다시 부른다.
  - 취소된 예약은 `canceled_at` · 취소 주체 `cancel_actor`(이용자 · 업체) · `cancel_reason` 을 보여 준다.

### U8 이용 중 취소 동의 — `/reservation/[reservation_id]/cancel-request` ★
- 시안: 이용자 화면 › `U8 취소 동의`
- 구성: 업체 이름 · 호실 · 업체가 적은 사유 `cancel_reason` · 환불 금액 `refund_amount`(전액) · 남은 시간(`expires_at` — 10분) · "승인" · "거절"
- 들어올 때: `GET /api/v1/user-service/reservation/:reservation_id/cancel-request`
- 동작
  - "승인" → `PATCH /api/v1/user-service/reservation/:reservation_id/cancel-request/approve`(큐) → done `refund_amount` → U7.
  - "거절" → `PATCH /api/v1/user-service/reservation/:reservation_id/cancel-request/reject`(큐) → U7.
- 화면 주의: 상태가 요청 중(REQUESTED)이고 시간이 남았을 때만 버튼을 보인다. 만료 · 처리됨 · 404 는 안내 후 U7. 업체가 보낸 SMS 링크가 이 주소를 연다.

### U9 연장 — `/reservation/[reservation_id]/extension`
- 시안: 이용자 화면 › `U9 연장(가능)` · `U9 연장(불가)`
- 구성: 지금 이용 끝 → 새 끝 `end_at` · 추가 금액 `amount` · "연장 신청" / 불가 사유 `reason`
- 들어올 때: `GET /api/v1/user-service/reservation/:reservation_id/extension`
- 동작: `is_extendable` 1 이면 "연장 신청" → `POST /api/v1/user-service/reservation/:reservation_id/extension`(큐) → done `payment_id` · `order_name` · `amount` · `expires_at` → 토스 결제창(5분) → U4(같은 결제 확인 API).
- 화면 주의: 이용 중에만 연장할 수 있다. 같은 호실 바로 다음 시간이 비어 있어야 하고 업체 상품 설정의 최대 연장 횟수까지. 연장 신청 뒤 결제하지 않고 5분이 지나면 그 예약은 다시 연장할 수 없다. 이용 제한 · 탈퇴 대기면 막는다(서버도 400).

### U10 마이페이지 — `/me`
- 시안: 이용자 화면 › `U10 마이페이지` · `U10 마이페이지(탈퇴 대기)`
- 구성: 내 정보(닉네임 `nickname` · 가입한 SNS `sns_id` · 휴대폰 `phone` + 인증 여부 `is_phone_verified` · 성별 `gender` · 생년월일 `birth` · 가입일 `created_at` · 회원 식별 코드 `user_search_code`) · 회원 상태(정지면 사유 `block_comment` 띠, 탈퇴 대기면 탈퇴 예정 시각 `leave_reserved_at` + "탈퇴 철회") · 메뉴(내 예약 U6 · 입점 신청 U11) · 로그아웃 · 탈퇴 신청
- 들어올 때: `GET /api/v1/user-service/user/me`
- 동작
  - 휴대폰 미인증(`is_phone_verified` 0)이면 "휴대폰 인증하기" → `/phone-verification`.
  - "탈퇴 신청" → 사유(선택) → `DELETE /api/v1/user-service/user/leave`(큐 — `leave_comment`) → done 이면 내 정보를 다시 부른다.
  - "탈퇴 철회" → `PATCH /api/v1/user-service/user/leave`(큐) → done 이면 내 정보를 다시 부른다.
- 화면 주의: 탈퇴 대기는 14일 뒤 탈퇴되고 그 사이 로그인 · 철회가 된다. 회원 식별 코드는 고객 문의 때 알려 주는 코드다.

### U11 입점 신청 — `/store-applications` · `/store-applications/new` · `/store-applications/[store_application_id]`
- 시안: 이용자 화면 › `U11 입점 신청 목록` · `U11 입점 신청 작성` · `U11 입점 신청 상세` · `U11 입점 신청 상세(승인)`
- 구성
  - 목록: 신청 카드(`store_name` · `business_number` · 상태 · 신청일 · 승인되면 업체코드 `store_code` · 반려면 `reject_comment`)
  - 작성: 업체 이름 · 사업자번호 · 대표자 · 대표 휴대폰 · 업체 총관리자 아이디 · 비밀번호(업체 콘솔 로그인에 쓴다) · 업체 전화 · 주소(주소 검색으로 `latitude` · `longitude` 까지) · 상세 주소 · 남길 말
  - 상세: 신청 내용 · 파일(사업자등록증 · 업체 사진 — `file_url`) · 파일 올리기 · 신청 취소
- 동작
  - 목록: `GET /api/v1/user-service/store/application/mine`
  - 작성 "신청" → `POST /api/v1/user-service/store/application`(큐) → done `store_application_id` → 상세로(파일 올리기).
  - 상세: `GET /api/v1/user-service/store/application/mine/:store_application_id`
  - 파일 올리기: `POST /api/v1/user-service/store/application/mine/:store_application_id/file/upload-url`(`store_file_purpose_id` · `content_type`) → 받은 `upload_url` 로 파일을 PUT → `POST /api/v1/user-service/store/application/mine/:store_application_id/file`(큐 — `store_file_purpose_id` · `file_key` · `file_name` · `content_type`) → 상세 다시 조회.
  - 파일 지우기 → `DELETE /api/v1/user-service/store/application/mine/:store_application_id/file/:store_file_id`(큐)
  - 신청 취소 → `DELETE /api/v1/user-service/store/application/mine/:store_application_id`(큐) → 목록.
- 화면 주의: 사업자등록증 사진이 1장 없으면 관리자가 승인할 수 없다 — 작성 뒤 바로 올리게 안내. 사진은 JPG · PNG 만. 대기(WAIT) 신청만 고치고 취소할 수 있다. 승인되면 업체 콘솔 로그인 주소(`<프론트 주소>/manager/<store_code>/login` — "로그인 주소 복사" 버튼)와 함께, 신청 때 정한 아이디 · 비밀번호로 로그인한다고 안내.

---

## 업체 관리자 `/manager` — PC 콘솔

콘솔 틀: 왼쪽 메뉴(대시보드 · 예약 현황 · 호실 · 객실 그룹 · 상품 설정 · 내 업체 설정 · 업체 관리자 — 마지막은 업체 총관리자만) · 상단 업체 이름 · 계정 · 로그아웃.

### M1 로그인 · 아이디 찾기 · 비밀번호 초기화 · 비밀번호 변경 — `/manager/[store_code]/login` · `/manager/[store_code]/find-login-id` · `/manager/[store_code]/password-reset` · `/manager/login` · `/manager/password`
- 시안: 업체 관리자 콘솔 › `M1 로그인` · `M1 아이디 찾기` · `M1 비밀번호 초기화` · `M1 업체 로그인 주소 안내` · `M1 비밀번호 변경`
- **업체코드는 주소에 들어 있다**(사용자 결정 2026-11-10): 업체코드 `store_code` 는 32자 영문 소문자 · 숫자 ID 라 사람이 치지 않는다. 로그인 전 화면 3개는 주소의 `[store_code]` 를 그대로 API 에 넘기고, 화면에는 아이디 · 비밀번호(· 휴대폰)만 받는다. 업체 관리자는 자기 업체 로그인 주소(`<프론트 주소>/manager/<store_code>/login`)를 즐겨찾기한다. 로그인 뒤 화면은 `/manager/…` 그대로(토큰이 업체를 안다).
- 구성: 가운데 카드 — "업체 관리자 로그인" 제목(로그인 전에는 업체 이름을 읽는 API 가 없어 업체 이름을 띄우지 않는다) · 아이디 · 비밀번호 · 로그인 · 아이디 찾기 / 비밀번호 초기화 링크(같은 `[store_code]` 주소).
- 동작
  - 로그인: `POST /api/v1/admin-service/manager/login`(`store_code` = 주소 값 · `login_id` · `login_pw`) → 토큰 · `auth_id`(HEAD_MANAGER 업체 총관리자 · MANAGER) · `store_id` 저장, 이 업체코드도 브라우저에 기억해 둔다(로그아웃 · 401 때 돌아갈 로그인 주소). `is_password_change_required` 1 이면 `/manager/password` 로 보낸다.
  - 재발급: `POST /api/v1/admin-service/manager/token-refresh`(`refresh_token`)
  - 아이디 찾기: `POST /api/v1/admin-service/manager/find-login-id`(큐 — `store_code` = 주소 값 · `phone`) → `POST /api/v1/admin-service/manager/find-login-id/confirm`(큐 — `sms_verification_id` · `code`) → done `login_id` · `created_at`.
  - 비밀번호 초기화: `POST /api/v1/admin-service/manager/password-reset`(큐 — `store_code` = 주소 값 · `login_id` · `phone`) → `POST /api/v1/admin-service/manager/password-reset/confirm`(큐 — `sms_verification_id` · `code`) → 임시 비밀번호가 SMS 로 간다 → 로그인 → 비밀번호 변경.
  - 업체 로그인 주소 안내 `/manager/login`(업체코드 없이 들어온 경우): 기억해 둔 업체코드가 있으면 그 로그인 주소로 보내고, 없으면 "업체 로그인 주소로 접속해 주세요" 안내 + 업체코드를 붙여 넣는 칸 하나(넣으면 `/manager/<업체코드>/login` 으로 이동 — API 호출 없음).
  - 비밀번호 변경(로그인 뒤): `PATCH /api/v1/admin-service/manager/password`(큐 — `current_password` · `new_password`)
- 화면 주의: 업체코드 · 아이디 · 비밀번호 중 하나라도 틀리면 404 "잘못된 로그인 정보입니다."(어느 것이 틀렸는지 가르지 않는다 — 주소의 업체코드가 틀려도 같다). 정지 계정은 403 — 실패 본문의 `block_comment`(정지 사유)를 보여 준다. 업체 관리자 등록 SMS 에는 업체코드가 글자로만 가고 로그인 주소는 가지 않는다 — 업체 총관리자가 M7 의 "로그인 주소 복사"로 알려 준다.

### M2 대시보드 — `/manager`
- 시안: 업체 관리자 콘솔 › `M2 대시보드`
- 구성: 기간(시작 달 ~ 끝 달) · 결제 환경(실결제 · 테스트) → 합계 카드(이용자 수 `user_count` · 이용 건수 `completed_count` · 결제액 `paid_amount` · 환불액 `refund_amount` · 수익 `profit`) → 월별 표 · 그래프(`monthly`)
- 들어올 때: `GET /api/v1/admin-service/stats/mine`(`start_month` · `end_month` YYYY-MM · `environment` LIVE · TEST)
- 화면 주의: 기간을 비우면 최근 3개월, 최대 12개월. 업체 상태가 영업중지면 `/manager/store` 의 `suspend_comment` 를 띠로 보여 준다.

### M3 예약 현황 — `/manager/reservations`
- 시안: 업체 관리자 콘솔 › `M3 예약 현황` · `M3 업체 취소` · `M3 호실 이동` · `M3 이용 중 취소 요청`
- 구성: 날짜 고르기 → 호실별 줄(`room_name` · `floor` · 그룹 · 호실 상태 `room_state_name`) 위에 예약 막대(`start_at` ~ `end_at`, 정비 포함 점유 끝 `blocked_until` · 상태 · 상품 · 예약자 `user_name` · `user_phone` · 금액 · 이용 중 취소 요청 상태 `cancel_request_state_id`) → 막대를 누르면 작업 메뉴
- 들어올 때: `GET /api/v1/admin-service/reservation/store`(`date`)
- 동작(끝나면 현황을 다시 부른다)
  - 업체 취소(시작 전 예약만) → 사유 → `PATCH /api/v1/admin-service/reservation/:reservation_id/store-cancel`(큐 — `cancel_reason`) — 전액 환불.
  - 호실 이동 → 옮길 호실 고르기(같은 업체 호실 — `GET /api/v1/admin-service/room` 결과) → `PATCH /api/v1/admin-service/reservation/:reservation_id/room`(큐 — `room_id`)
  - 이용 중 취소 요청(이용 중 예약) → 사유 → `POST /api/v1/admin-service/reservation/:reservation_id/use-cancel-request`(큐 — `cancel_reason`) → done `expires_at`(10분) — 예약자에게 동의 링크 SMS 가 간다. 결과(승인 · 거절 · 만료)는 현황의 `cancel_request_state_id` 로 본다.
- 화면 주의: 시작한 예약은 업체 취소가 안 되고(400) 이용 중 취소 요청만 된다. 옮길 호실 시간이 비어 있지 않으면 400.

### M4 호실 — `/manager/rooms`
- 시안: 업체 관리자 콘솔 › `M4 호실` · `M4 호실 등록 · 수정`
- 구성: 거르기(층 `floor` · 객실 그룹) → 호실 표(`room_name` · 층 · 그룹 · 상태 `room_state_name` · 문 상태 `door_state` 열림 · 닫힘 · 바뀐 시각 `door_changed_at`) · 줄마다 수정 · 상태 · 문 열기 · 삭제
- 들어올 때
  - `GET /api/v1/admin-service/room`(`floor` · `room_group_id` · `page`)
  - 그룹 거르기 · 등록 고르기용 `GET /api/v1/admin-service/room/group`(`all_search_yn=Y`)
- 동작(끝나면 목록을 다시 부른다)
  - 등록 → `POST /api/v1/admin-service/room`(큐 — `room_group_id` · `room_name` · `floor`)
  - 수정 → `PATCH /api/v1/admin-service/room/:room_id`(큐 — `room_name` · `floor`)
  - 상태 → `PATCH /api/v1/admin-service/room/:room_id/state`(큐 — `room_state_id` AVAILABLE · DISABLED): 정비중 → 예약가능이 "정비 완료", 사용중지 · 해제
  - 문 바로 열기 → `POST /api/v1/admin-service/room/:room_id/door-open`(동기) → 바뀐 `door_state` 를 그 줄에 반영
  - 삭제 → `DELETE /api/v1/admin-service/room/:room_id`(큐)
- 화면 주의: 사용중지로 바꾸면 그 호실 예약자는 끝 전까지 전액 환불 취소를 할 수 있다(안내 문구). 앞으로의 예약이 있는 호실은 삭제가 안 된다(400). 문 바로 열기는 문 쪽 프로그램이 연결돼 있어야 한다(503 이면 잠시 뒤).

### M5 객실 그룹 — `/manager/room-groups` · `/manager/room-groups/[room_group_id]`
- 시안: 업체 관리자 콘솔 › `M5 객실 그룹 목록` · `M5 객실 그룹 상세` · `M5 기간 가격`
- 구성
  - 목록: 검색(`keyword`) · 그룹 카드(대표 사진 `image_url` · 이름 · 호실 수 `room_count`) · "그룹 등록"
  - 상세: 기본 정보(이름 · 설명 · 편의시설 — 방 개수 · 샤워실 · TV · PC) · 사진(순서 끌어 바꾸기 · 삭제 · 올리기) · 그룹 상품 표(상품마다 판매 `is_used` · 가격 `price`) · 상품별 기간 가격 표(`start_date` ~ `end_date` · `price` · `memo`)
- 들어올 때
  - 목록: `GET /api/v1/admin-service/room/group`(`keyword` · `page`)
  - 상세: `GET /api/v1/admin-service/room/group/:room_group_id` + 상품을 고르면 `GET /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price`
- 동작(끝나면 그 화면의 조회를 다시 부른다)
  - 그룹 등록 → `POST /api/v1/admin-service/room/group`(큐 — `room_group_name` · `description` · `room_group_detail`) → done `room_group_id` → 상세로
  - 그룹 수정 → `PATCH /api/v1/admin-service/room/group/:room_group_id`(큐) · 삭제 → `DELETE /api/v1/admin-service/room/group/:room_group_id`(큐) → 목록
  - 사진 올리기: `POST /api/v1/admin-service/room/group/:room_group_id/image/upload-url`(`content_type`) → `upload_url` 로 PUT → `POST /api/v1/admin-service/room/group/:room_group_id/image`(큐 — `file_key` · `file_name` · `content_type`)
  - 사진 순서 → `PUT /api/v1/admin-service/room/group/:room_group_id/image/order`(큐 — 전체 순서 `room_group_image_ids`) · 사진 삭제 → `DELETE /api/v1/admin-service/room/group/:room_group_id/image/:room_group_image_id`(큐)
  - 그룹 상품 → `PATCH /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id`(큐 — `is_used` · `price`)
  - 기간 가격 추가 · 수정 · 삭제 → `POST /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price` · `PATCH /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id` · `DELETE /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id`(모두 큐 — `start_date` · `end_date` · `price` · `memo`)
- 화면 주의: 기간 가격은 같은 상품 안에서 날짜가 겹치면 400. 업체 상품 설정(M6)에서 판매하지 않는 상품은 그룹 상품을 켜도 팔리지 않는다. 사진은 JPG · PNG 만, 첫 번째 사진이 대표 사진.

### M6 업체 상품 설정 — `/manager/plans`
- 시안: 업체 관리자 콘솔 › `M6 업체 상품 설정`
- 구성: 상품 3개(시간 이용 · 1박 · 연박) 카드 — 판매 `is_used` · 판매 요일 `days_of_week` · 시간 이용은 이용 시간 `usage_hours` · 1박은 입실 `check_in_time` · 퇴실 `check_out_time` · 연박은 최소 · 최대 박수 · 연장 가능 `is_extendable` · 최대 연장 횟수 `max_extensions`
- 들어올 때: `GET /api/v1/admin-service/room/plan`
- 동작: 카드 "저장" → `PATCH /api/v1/admin-service/room/plan/:room_plan_type_id`(큐 — 상품 종류에 맞는 필드, `is_extendable` · `max_extensions` 는 늘 필수 1 ~ 10) → 다시 조회
- 화면 주의: 요일은 비트 합(`1 << 요일`, 일 0 ~ 토 6, 매일 127). 연장 설정은 이용자가 연장할 때의 지금 설정을 따른다.

### M7 내 업체 설정 — `/manager/store`
- 시안: 업체 관리자 콘솔 › `M7 내 업체 설정(기본 정보)` · `M7 내 업체 설정(사진)` · `M7 내 업체 설정(영업시간 · 브레이크)` · `M7 내 업체 설정(운영 규정)` · `M7 내 업체 설정(일시 예약불가)` · `M7 내 업체 설정(문 연동)`
- 구성: 탭 — 기본 정보(업체코드 `store_code` + 업체 로그인 주소 `<프론트 주소>/manager/<store_code>/login` "로그인 주소 복사" · 상태 · 사업자 정보는 읽기만, 소개 `introduction` · 전화 `phone` 수정) · 사진(업체 사진 순서 · 삭제 · 올리기, 사업자등록증은 보기만) · 영업시간(24시간 `is_always_open` · 요일별 휴무 `is_closed` · 여는 · 닫는 시각) · 브레이크 · 운영 규정(영업중 `is_open` · 정비시간 `maintenance_minutes` · 예약 가능 시작 `booking_open_hours` · 환불 마감 `refund_deadline_minutes` · 마감 뒤 환불 비율 `late_refund_percent`) · 일시 예약불가(기간 목록 · 추가 · 삭제) · 문 연동(시크릿 설정 여부 `is_door_secret_set` · 새 시크릿 — 업체 총관리자만)
- 들어올 때: `GET /api/v1/admin-service/store/mine` + 일시 예약불가 탭에서 `GET /api/v1/admin-service/store/mine/unavailable-period`
- 동작(끝나면 다시 조회)
  - 기본 정보 → `PATCH /api/v1/admin-service/store/mine/profile`(큐 — `introduction` · `phone`)
  - 사진: `POST /api/v1/admin-service/store/mine/file/upload-url`(`content_type`) → PUT → `POST /api/v1/admin-service/store/mine/file`(큐) · 순서 `PUT /api/v1/admin-service/store/mine/file/order`(큐 — 전체 `store_file_ids`) · 삭제 `DELETE /api/v1/admin-service/store/mine/file/:store_file_id`(큐)
  - 영업시간 → `PUT /api/v1/admin-service/store/mine/hours`(큐 — `is_always_open` + 7요일 `hours`) · 브레이크 → `PUT /api/v1/admin-service/store/mine/breaks`(큐 — 전체 `breaks`)
  - 정비시간 → `PATCH /api/v1/admin-service/store/mine/maintenance`(큐) · 영업중 → `PATCH /api/v1/admin-service/store/mine/open`(큐) · 예약 · 환불 규정 → `PATCH /api/v1/admin-service/store/mine/reservation-policy`(큐)
  - 일시 예약불가 추가 → `POST /api/v1/admin-service/store/mine/unavailable-period`(큐 — `starts_at` · `ends_at` · `memo`) · 삭제 → `DELETE /api/v1/admin-service/store/mine/unavailable-period/:store_unavailable_period_id`(큐)
  - 문 시크릿 → `PATCH /api/v1/admin-service/store/mine/door-secret`(큐 — `door_secret`)
- 화면 주의: 영업시간 · 브레이크 · 사진 순서는 통째로 바꾸는 PUT 이다(보낸 목록이 전부). 휴무가 아닌 요일은 여는 · 닫는 시각이 둘 다 필요하고, 닫는 시각이 여는 시각보다 이르면 다음 날까지다. 일시 예약불가는 서로 겹치면 400. 문 시크릿을 바꾸면 연결된 문 쪽 프로그램이 끊기고 새 시크릿으로 다시 붙어야 한다 — 업체 총관리자가 아니면 탭을 숨긴다(403).

### M8 업체 관리자 관리 — `/manager/staff` · `/manager/staff/[user_id]`
- 시안: 업체 관리자 콘솔 › `M8 업체 관리자 목록` · `M8 업체 관리자 상세 · 등록`
- 구성: 검색(`keyword`) · 표(`login_id` · `name` · `phone` · 권한 · 상태 · 비밀번호 변경 필요 · 등록일) / 상세(정보 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제)
- 들어올 때: 목록 `GET /api/v1/admin-service/manager/staff`(`keyword` · `page`) · 상세 `GET /api/v1/admin-service/manager/staff/:user_id`
- 동작(끝나면 다시 조회)
  - 등록 → `POST /api/v1/admin-service/manager/staff`(큐 — `login_id` · `name` · `phone` · `gender` · `birth`) — 업체코드 · 아이디 · 임시 비밀번호가 그 휴대폰으로 SMS
  - 수정 → `PATCH /api/v1/admin-service/manager/staff/:user_id`(큐) · 비밀번호 초기화 → `PATCH /api/v1/admin-service/manager/staff/:user_id/password-reset`(큐 — 임시 비밀번호 SMS)
  - 정지 · 해제 → `PATCH /api/v1/admin-service/manager/staff/:user_id/state`(큐 — `state_id` BLOCK · ACTIVE · 정지 사유 `block_comment`) · 삭제 → `DELETE /api/v1/admin-service/manager/staff/:user_id`(큐) → 목록
- 화면 주의: 업체 총관리자(`auth_id` HEAD_MANAGER)만 — 매니저면 메뉴를 숨긴다(403). 아이디 · 휴대폰은 같은 업체 안에서 겹치면 400.

---

## 총관리자 · 관리자 `/admin` — PC 콘솔

콘솔 틀: 왼쪽 메뉴(대시보드 · 입점 신청 · 업체 · 업체 관리자 · 이용자) · 상단 계정 · 로그아웃. 업체 관리자 콘솔과 같은 틀.

### A1 로그인 · 비밀번호 변경 — `/admin/login` · `/admin/password`
- 시안: 관리자 콘솔 › `A1 로그인` · `A1 비밀번호 변경`
- 동작
  - 로그인: `POST /api/v1/admin-service/admin/login`(`login_id` · `login_pw`) → 토큰 · `auth_id` 저장, `is_password_change_required` 1 이면 `/admin/password`.
  - 재발급: `POST /api/v1/admin-service/admin/token-refresh`(`refresh_token`)
  - 비밀번호 변경: `PATCH /api/v1/admin-service/admin/password`(큐 — `current_password` · `new_password`)
- 화면 주의: 관리자는 아이디 찾기 · 비밀번호 초기화가 없다. 틀리면 404 "잘못된 로그인 정보입니다.", 정지 계정은 403 + `block_comment`.

### A2 대시보드 — `/admin`
- 시안: 관리자 콘솔 › `A2 대시보드`
- 구성: 기간 · 결제 환경 · 업체 범위(활동 업체만 · 모든 업체) → 합계 카드 → 월별 표 · 그래프 → 업체별 표(업체 이름 · 업체코드 · 상태 · 합계 항목들, 페이지)
- 들어올 때: `GET /api/v1/admin-service/stats`(`start_month` · `end_month` · `environment` · `has_activity` 1 · 0 · `page`)
- 화면 주의: 기간을 비우면 최근 3개월, 최대 12개월. 업체별 줄 → A4 상세.

### A3 입점 신청 관리 — `/admin/store-applications` · `/admin/store-applications/[store_application_id]`
- 시안: 관리자 콘솔 › `A3 입점 신청 목록` · `A3 입점 신청 상세`
- 구성: 상태 거르기(대기 · 승인 · 반려) · 검색 · 표 / 상세(신청 내용 · 신청자 `applicant` · 파일 — 사업자등록증 · 업체 사진 `file_url` · 승인 · 반려)
- 들어올 때: 목록 `GET /api/v1/admin-service/store/application`(`store_application_state_id` · `keyword` · `page`) · 상세 `GET /api/v1/admin-service/store/application/:store_application_id`
- 동작
  - 승인 → `PATCH /api/v1/admin-service/store/application/:store_application_id/approve`(큐) → done `store_id` · `store_code` 와 업체 로그인 주소(`<프론트 주소>/manager/<store_code>/login`, 복사 버튼)를 보여 준다(대표 휴대폰으로 승인 SMS — 업체 이름만 간다).
  - 반려 → 사유 → `PATCH /api/v1/admin-service/store/application/:store_application_id/reject`(큐 — `reject_comment`)
- 화면 주의: 사업자등록증 사진이 없으면 승인 400. 사업자등록증 주소는 10분짜리 열람 주소라 상세를 열 때마다 새로 받는다. 대기 신청만 승인 · 반려.

### A4 업체 관리 — `/admin/stores` · `/admin/stores/[store_id]`
- 시안: 관리자 콘솔 › `A4 업체 목록` · `A4 업체 상세`
- 구성: 상태 거르기 · 검색 · 표(업체코드 · 이름 · 사업자번호 · 대표자 · 전화 · 주소 · 영업중 · 상태) / 상세(정보 수정 · 상태 변경 · 영업중 · 파일 · 이 업체의 업체 관리자 → A5)
- 들어올 때: 목록 `GET /api/v1/admin-service/store`(`store_state_id` · `keyword` · `page`) · 상세 `GET /api/v1/admin-service/store/:store_id`
- 동작(끝나면 다시 조회)
  - 정보 수정 → `PATCH /api/v1/admin-service/store/:store_id`(큐 — 이름 · 대표자 · 전화 · 주소 · 좌표)
  - 상태 변경 → `PATCH /api/v1/admin-service/store/:store_id/state`(큐 — `store_state_id` ACTIVE · SUSPEND · LEAVE · 영업중지 사유 `suspend_comment`)
  - 영업중 → `PATCH /api/v1/admin-service/store/:store_id/open`(큐 — `is_open`)
- 화면 주의: 영업중지 · 탈퇴 업체는 이용자 지도에 나오지 않는다.

### A5 업체 관리자 계정 — `/admin/managers` · `/admin/managers/[user_id]`
- 시안: 관리자 콘솔 › `A5 업체 관리자 목록` · `A5 업체 관리자 상세`
- 구성: 거르기(업체 · 권한 · 상태) · 검색 · 표(업체 · 업체코드 · 아이디 · 이름 · 휴대폰 · 권한 · 상태) / 상세(정보 · 비밀번호 초기화)
- 들어올 때: 목록 `GET /api/v1/admin-service/manager/account`(`keyword` · `store_id` · `auth_id` · `state_id` · `page`) · 상세 `GET /api/v1/admin-service/manager/account/:user_id`
- 동작: 비밀번호 초기화 → `PATCH /api/v1/admin-service/manager/account/:user_id/password-reset`(큐 — 임시 비밀번호 SMS)
- 화면 주의: 휴대폰이 없는 계정 · 탈퇴한 업체의 계정은 초기화할 수 없다(400). 정지 계정도 초기화는 된다(로그인은 계속 막힘).

### A6 이용자 관리 — `/admin/users` · `/admin/users/[user_id]`
- 시안: 관리자 콘솔 › `A6 이용자 목록` · `A6 이용자 상세`
- 구성: 거르기(상태 · SNS) · 검색 · 표(검색 코드 `user_search_code` · 닉네임 · 이름 · 휴대폰 · SNS · 상태 · 가입일) / 상세(정보 · 예약 요약 `reservation_summary` · 예약 이력 표 · 이용 제한 · 해제)
- 들어올 때: 목록 `GET /api/v1/admin-service/user`(`keyword` · `state_id` · `sns_id` · `page`) · 상세 `GET /api/v1/admin-service/user/:user_id` + `GET /api/v1/admin-service/user/:user_id/reservation`(`page`)
- 동작: 이용 제한 · 해제 → `PATCH /api/v1/admin-service/user/:user_id/state`(큐 — `state_id` BLOCK · ACTIVE · 제한 사유 `block_comment`) → 상세 다시 조회
- 화면 주의: 이용 제한된 이용자는 로그인은 되고 새 예약 · 연장만 막힌다(제한 사유가 이용자 화면에 보인다).
