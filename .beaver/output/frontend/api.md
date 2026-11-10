# API 목록 · 호출 방식

백엔드 공개 API 108개와 부르는 방법. 화면마다 어떤 API 를 어떤 순서로 쓰는지는 [screens.md](screens.md), 요청 · 응답 필드는 [dto/](dto/) (기준: 백엔드 Phase 27(2026-11-10)).

## 호출 방식

### 주소
- `<게이트웨이 주소>/api/v1/<서비스>/<도메인>/…` — 서비스는 `user-service`(이용자 쪽) · `admin-service`(업체 · 관리자 쪽).
- 경로의 `:이름` 은 값으로 바꾼다(`encodeURIComponent`). 요청 · 응답 키는 모두 snake_case.
- `GET` 의 입력은 query 문자열, 그 밖은 JSON 본문(`Content-Type: application/json`).

### 로그인
- 로그인 그룹이 셋이고 그룹마다 로그인 · 재발급 API 와 토큰이 따로다 — 이용자 `user-service/user/login` · 매니저 `admin-service/manager/login` · 관리자 `admin-service/admin/login`. 다른 그룹 토큰은 401.
- 로그인이 필요한 API(아래 표 "로그인" 이 공개가 아닌 것)는 `Authorization: Bearer <access_token>`.
- 401 이면 그 그룹의 `token-refresh`(`refresh_token`)로 재발급하고 한 번 다시 보낸다. 또 401 이면 로그인 화면으로. 만료 시각은 로그인 결과의 `access_token_expires_at` · `refresh_token_expires_at`.
- "매니저(업체 총관리자)" API 는 업체 총관리자(`auth_id` HEAD_MANAGER)만 — 매니저는 403.

### 방식 — 동기 · 큐
- **동기**: 보통 JSON 응답(200). 조회 · 로그인 · 재발급 · 업로드 주소 발급 · 문 바로 열기.
- **큐**: 상태를 바꾸는 쓰기. 응답이 `text/event-stream` 이고 이벤트가 차례로 온다.
  1. `accepted` — data `{request_id}`
  2. 다음 중 하나 → 스트림이 끝난다
     - `done` — data = 표의 응답 DTO(응답이 null 인 API 는 `null`)
     - `failed` — data `{status_code, message, validation_errors, …}`(실패 본문 + 상태 코드)
     - `pending` — data `{request_id, message}`. 30초 안에 결과가 오지 않았다는 뜻이고 처리는 됐을 수 있다 — 그 리소스를 다시 조회해 확인한다.
- POST · PATCH · PUT · DELETE 에 헤더가 필요해 `EventSource` 대신 `fetch` 스트림으로 읽는다. 이벤트 이름 상수는 [dto/common.md](dto/common.md) 의 `COMMAND_STREAM_EVENT`.

```ts
/** 큐 API 호출 — done 이면 data 를 돌려주고, failed 면 실패 본문을 던지고, pending 이면 null(다시 조회) */
async function callQueue<T>(url: string, method: string, token: string | null, body?: unknown): Promise<T | null> {
    const res = await fetch(url, {
        method,
        headers: {'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? {Authorization: `Bearer ${token}`} : {})},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await res.json(); // 스트림 전 실패(입력 검증 400 · 로그인 401 · 권한 403) — 일반 JSON 실패 본문
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
        const {value, done} = await reader.read();
        if (done) return null;
        buffer += value;
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const event = /^event: (.+)$/m.exec(chunk)?.[1];
            const data = JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] ?? 'null');
            if (event === 'done') return data as T;
            if (event === 'failed') throw data;
            if (event === 'pending') return null;
        }
    }
}
```

### 실패
- 모든 실패는 같은 모양 — 동기 응답 본문이든 큐의 `failed` data 든 `{message, validation_errors, …}`([dto/common.md](dto/common.md) `ApiFailResultDto`).
- `validation_errors`(`[{property, message}]`)는 입력 칸 오류 — 그 칸 옆에 `message` 를 보여 준다(중첩 칸은 `hours.0.open_time` 같은 점 경로). `null` 이면 `message` 를 띄운다.
- 기능별 추가 필드가 함께 올 수 있다 — 정지 계정 로그인 `block_comment`, 결제 실패 `payment_error_code`.
- 상태 코드: 400 입력 · 규칙 위반 / 401 로그인 필요 · 토큰 만료 / 403 권한 · 정지 / 404 없음 / 503 외부 연동(문자 · 파일 · 결제 · 문)이 잠시 안 됨 — 잠시 뒤 다시 / 500 서버 오류.
- 입력 검증은 [dto/](dto/) 의 `class-validator` 데코레이터를 화면에서도 그대로 쓴다(`validate(plainToInstance(XDto, 값))`) — 서버와 같은 한국어 메시지가 나온다.

### 목록
- query `page`(기본 1) · `size`(기본 20) · `page_size`(페이지 탭 수, 기본 10) · `all_search_yn`(`Y` 면 전부) — `PaginationDto`.
- 응답 `{list, pagination}` — `pagination` 은 `total_count` · `page` · `max_page` · `page_range{start, end}` · 번호 매기기 값.

### 파일 · 사진 올리기
1. 업로드 주소 발급(동기) — `content_type`(JPG `image/jpeg` · PNG `image/png`) → `{file_key, upload_url, expires_at}`
2. 브라우저가 `upload_url` 로 파일을 `PUT`(헤더 `Content-Type` 은 1에서 보낸 값) — S3 로 바로 간다.
3. 등록 API(큐)에 `file_key` · `file_name` · `content_type` 을 넘긴다.
- 보여 줄 때는 응답의 주소(`image_url` · `file_url`)를 쓴다. 공개 사진은 CDN 주소, 사업자등록증 같은 비공개 파일은 10분짜리 열람 주소라 화면을 열 때마다 새로 받는다.

### 결제(토스페이먼츠)
1. 예약 생성 · 연장 신청(큐)의 done → `payment_id` · `order_name` · `amount` · `expires_at`
2. 토스 결제창 — orderId = `payment_id`, orderName = `order_name`, amount = `amount`, 성공 · 실패 주소는 `/payments/success` · `/payments/fail`
3. 성공 주소에서 프론트 서버(Next.js)가 토스 결제 승인 API(시크릿 키)를 부른다.
4. `POST /api/v1/user-service/reservation/payment-confirm`(`payment_id` · `payment_key`) — 서버가 토스에서 다시 읽어 금액 · 주문을 대조하고 확정한다.
- `expires_at`(5분) 안에 4까지 끝나지 않으면 예약 · 연장 구간은 만료된다(승인된 결제는 서버가 환불).

### 시각 · 날짜 · 값
- 시각은 ISO 8601(`2026-11-10T09:30:00.000Z`) — 화면에는 한국 시각으로. 날짜는 `YYYY-MM-DD`, 달은 `YYYY-MM`, 하루 안 시각은 `HH:mm`(한국 시각).
- 금액은 원 단위 정수. 여부 값(`is_*` · `has_*`)은 1 · 0. 상태 · 종류 값의 한국어 이름은 응답의 `*_name`, 없으면 [dto/common.md](dto/common.md) 룩업 표.

## API 표

"로그인" — 공개 · 이용자 · 매니저 · 매니저(업체 총관리자) · 관리자. "쓰는 화면" 의 키는 [screens.md](screens.md).

### 이용자 계정 — `/api/v1/user-service/user`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `POST /api/v1/user-service/user/find-login-id` | 큐 | 공개 | 본문 UserFindLoginIdDto | UserFindLoginIdResultDto | 아이디 찾기 — 인증번호 발송 | U5 |
| `POST /api/v1/user-service/user/find-login-id/confirm` | 큐 | 공개 | 본문 UserFindLoginIdConfirmDto | UserFindLoginIdConfirmResultDto | 아이디 찾기 — 인증번호 확인 | U5 |
| `PATCH /api/v1/user-service/user/leave` | 큐 | 이용자 | — | null | 회원 탈퇴 철회 | U10 |
| `DELETE /api/v1/user-service/user/leave` | 큐 | 이용자 | 본문 UserLeaveDto | null | 회원 탈퇴 신청 | U10 |
| `POST /api/v1/user-service/user/login` | 동기 | 공개 | 본문 UserLoginDto | UserLoginResultDto | SNS 로그인 | U5 |
| `GET /api/v1/user-service/user/me` | 동기 | 이용자 | — | UserMeResultDto | 내 정보 | U5 · U10 |
| `POST /api/v1/user-service/user/phone-verification` | 큐 | 이용자 | 본문 UserPhoneVerificationDto | UserPhoneVerificationResultDto | 휴대폰 인증번호 발송 | U5 |
| `POST /api/v1/user-service/user/phone-verification/confirm` | 큐 | 이용자 | 본문 UserPhoneVerificationConfirmDto | null | 휴대폰 인증번호 확인 | U5 |
| `POST /api/v1/user-service/user/sign` | 큐 | 공개 | 본문 UserSignDto | UserSignResultDto | SNS 회원가입 | U5 |
| `POST /api/v1/user-service/user/token-refresh` | 동기 | 공개 | 본문 UserTokenRefreshDto | UserTokenRefreshResultDto | 로그인 토큰 재발급 | U5 |

### 업체 둘러보기 — `/api/v1/user-service/discovery`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `GET /api/v1/user-service/discovery/store` | 동기 | 공개 | query DiscoveryStoreListDto | DiscoveryStoreListResultDto | 반경 업체 조회 | U1 |
| `GET /api/v1/user-service/discovery/store/:store_id` | 동기 | 공개 | 경로 DiscoveryStoreDetailParamDto | DiscoveryStoreDetailResultDto | 업체 상세 | U2 · U3 |
| `GET /api/v1/user-service/discovery/store/:store_id/room-group` | 동기 | 공개 | 경로 DiscoveryRoomGroupListParamDto | DiscoveryRoomGroupListResultDto | 업체의 객실 그룹 목록 | U2 |

### 이용자 예약 — `/api/v1/user-service/reservation`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `GET /api/v1/user-service/reservation` | 동기 | 이용자 | query ReservationListDto | ReservationListResultDto | 내 예약 목록 | U6 |
| `POST /api/v1/user-service/reservation` | 큐 | 이용자 | 본문 ReservationDto | ReservationResultDto | 예약 생성 | U3 |
| `GET /api/v1/user-service/reservation/:reservation_id` | 동기 | 이용자 | 경로 ReservationDetailParamDto | ReservationDetailResultDto | 내 예약 상세 | U7 |
| `PATCH /api/v1/user-service/reservation/:reservation_id/cancel` | 큐 | 이용자 | 경로 ReservationCancelParamDto<br>본문 ReservationCancelDto | ReservationCancelResultDto | 예약 취소 | U7 |
| `GET /api/v1/user-service/reservation/:reservation_id/cancel-request` | 동기 | 이용자 | 경로 ReservationCancelRequestParamDto | ReservationCancelRequestResultDto | 이용 중 취소 요청 조회 | U8 |
| `PATCH /api/v1/user-service/reservation/:reservation_id/cancel-request/approve` | 큐 | 이용자 | 경로 ReservationCancelRequestApproveParamDto | ReservationCancelRequestApproveResultDto | 이용 중 취소 요청 승인 | U8 |
| `PATCH /api/v1/user-service/reservation/:reservation_id/cancel-request/reject` | 큐 | 이용자 | 경로 ReservationCancelRequestRejectParamDto | null | 이용 중 취소 요청 거절 | U8 |
| `GET /api/v1/user-service/reservation/:reservation_id/extension` | 동기 | 이용자 | 경로 ReservationExtensionParamDto | ReservationExtensionResultDto | 연장 조회 | U9 |
| `POST /api/v1/user-service/reservation/:reservation_id/extension` | 큐 | 이용자 | 경로 ReservationExtendParamDto | ReservationExtendResultDto | 연장 신청 | U9 |
| `GET /api/v1/user-service/reservation/:reservation_id/qr` | 동기 | 이용자 | 경로 ReservationQrParamDto | ReservationQrResultDto | 내 예약 QR | U7 |
| `GET /api/v1/user-service/reservation/availability` | 동기 | 공개 | query ReservationAvailabilityDto | ReservationAvailabilityResultDto | 객실 그룹별 예약 가능 시간 | U3 |
| `POST /api/v1/user-service/reservation/payment-confirm` | 큐 | 이용자 | 본문 ReservationPaymentConfirmDto | ReservationPaymentConfirmResultDto | 결제 확인 | U4 |

### 입점 신청 — `/api/v1/user-service/store`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `POST /api/v1/user-service/store/application` | 큐 | 이용자 | 본문 StoreApplicationDto | StoreApplicationResultDto | 입점 신청 | U11 |
| `GET /api/v1/user-service/store/application/mine` | 동기 | 이용자 | query StoreMyApplicationListDto | StoreMyApplicationListResultDto | 내 입점 신청 목록 | U11 |
| `GET /api/v1/user-service/store/application/mine/:store_application_id` | 동기 | 이용자 | 경로 StoreMyApplicationParamDto | StoreMyApplicationResultDto | 내 입점 신청 상세 | U11 |
| `DELETE /api/v1/user-service/store/application/mine/:store_application_id` | 큐 | 이용자 | 경로 StoreApplicationCancelParamDto | null | 입점 신청 취소 | U11 |
| `POST /api/v1/user-service/store/application/mine/:store_application_id/file` | 큐 | 이용자 | 경로 StoreApplicationFileParamDto<br>본문 StoreApplicationFileDto | StoreApplicationFileResultDto | 업체 정보 파일 등록 | U11 |
| `DELETE /api/v1/user-service/store/application/mine/:store_application_id/file/:store_file_id` | 큐 | 이용자 | 경로 StoreApplicationFileDeleteParamDto | null | 업체 정보 파일 삭제 | U11 |
| `POST /api/v1/user-service/store/application/mine/:store_application_id/file/upload-url` | 동기 | 이용자 | 경로 StoreApplicationFileUploadUrlParamDto<br>본문 StoreApplicationFileUploadUrlDto | StoreApplicationFileUploadUrlResultDto | 업체 정보 파일 업로드 주소 | U11 |

### 업체 관리자 계정 — `/api/v1/admin-service/manager`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `GET /api/v1/admin-service/manager/account` | 동기 | 관리자 | query ManagerAccountListDto | ManagerAccountListResultDto | 업체 관리자 목록 (관리자) | A5 |
| `GET /api/v1/admin-service/manager/account/:user_id` | 동기 | 관리자 | 경로 ManagerAccountDetailParamDto | ManagerAccountDetailResultDto | 업체 관리자 상세 (관리자) | A5 |
| `PATCH /api/v1/admin-service/manager/account/:user_id/password-reset` | 큐 | 관리자 | 경로 ManagerAccountPasswordResetParamDto | null | 업체 관리자 비밀번호 초기화 (관리자) | A5 |
| `POST /api/v1/admin-service/manager/find-login-id` | 큐 | 공개 | 본문 ManagerFindLoginIdDto | ManagerFindLoginIdResultDto | 매니저 아이디 찾기 — 인증번호 발송 | M1 |
| `POST /api/v1/admin-service/manager/find-login-id/confirm` | 큐 | 공개 | 본문 ManagerFindLoginIdConfirmDto | ManagerFindLoginIdConfirmResultDto | 매니저 아이디 찾기 — 인증번호 확인 | M1 |
| `POST /api/v1/admin-service/manager/login` | 동기 | 공개 | 본문 ManagerLoginDto | ManagerLoginResultDto | 매니저 로그인 | M1 |
| `PATCH /api/v1/admin-service/manager/password` | 큐 | 매니저 | 본문 ManagerPasswordDto | null | 매니저 비밀번호 변경 | M1 |
| `POST /api/v1/admin-service/manager/password-reset` | 큐 | 공개 | 본문 ManagerPasswordResetDto | ManagerPasswordResetResultDto | 매니저 비밀번호 초기화 — 인증번호 발송 | M1 |
| `POST /api/v1/admin-service/manager/password-reset/confirm` | 큐 | 공개 | 본문 ManagerPasswordResetConfirmDto | null | 매니저 비밀번호 초기화 — 인증번호 확인 | M1 |
| `GET /api/v1/admin-service/manager/staff` | 동기 | 매니저(업체 총관리자) | query ManagerStaffListDto | ManagerStaffListResultDto | 업체 관리자 목록 | M8 |
| `POST /api/v1/admin-service/manager/staff` | 큐 | 매니저(업체 총관리자) | 본문 ManagerStaffDto | ManagerStaffResultDto | 업체 관리자 등록 | M8 |
| `GET /api/v1/admin-service/manager/staff/:user_id` | 동기 | 매니저(업체 총관리자) | 경로 ManagerStaffDetailParamDto | ManagerStaffDetailResultDto | 업체 관리자 상세 | M8 |
| `PATCH /api/v1/admin-service/manager/staff/:user_id` | 큐 | 매니저(업체 총관리자) | 경로 ManagerStaffUpdateParamDto<br>본문 ManagerStaffUpdateDto | null | 업체 관리자 수정 | M8 |
| `DELETE /api/v1/admin-service/manager/staff/:user_id` | 큐 | 매니저(업체 총관리자) | 경로 ManagerStaffDeleteParamDto | null | 업체 관리자 삭제 | M8 |
| `PATCH /api/v1/admin-service/manager/staff/:user_id/password-reset` | 큐 | 매니저(업체 총관리자) | 경로 ManagerStaffPasswordResetParamDto | null | 업체 관리자 비밀번호 초기화 | M8 |
| `PATCH /api/v1/admin-service/manager/staff/:user_id/state` | 큐 | 매니저(업체 총관리자) | 경로 ManagerStaffStateParamDto<br>본문 ManagerStaffStateDto | null | 업체 관리자 정지 · 해제 | M8 |
| `POST /api/v1/admin-service/manager/token-refresh` | 동기 | 공개 | 본문 ManagerTokenRefreshDto | ManagerTokenRefreshResultDto | 매니저 토큰 재발급 | M1 |

### 관리자 계정 — `/api/v1/admin-service/admin`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `POST /api/v1/admin-service/admin/login` | 동기 | 공개 | 본문 AdminLoginDto | AdminLoginResultDto | 관리자 로그인 | A1 |
| `PATCH /api/v1/admin-service/admin/password` | 큐 | 관리자 | 본문 AdminPasswordDto | null | 관리자 비밀번호 변경 | A1 |
| `POST /api/v1/admin-service/admin/token-refresh` | 동기 | 공개 | 본문 AdminTokenRefreshDto | AdminTokenRefreshResultDto | 관리자 토큰 재발급 | A1 |

### 업체 · 입점 신청 관리 · 내 업체 설정 — `/api/v1/admin-service/store`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `GET /api/v1/admin-service/store` | 동기 | 관리자 | query StoreListDto | StoreListResultDto | 업체 목록 | A4 |
| `GET /api/v1/admin-service/store/:store_id` | 동기 | 관리자 | 경로 StoreDetailParamDto | StoreDetailResultDto | 업체 상세 | A4 |
| `PATCH /api/v1/admin-service/store/:store_id` | 큐 | 관리자 | 경로 StoreUpdateParamDto<br>본문 StoreUpdateDto | null | 업체 정보 수정 | A4 |
| `PATCH /api/v1/admin-service/store/:store_id/open` | 큐 | 관리자 | 경로 StoreOpenParamDto<br>본문 StoreOpenDto | null | 업체 영업중 여부 변경 | A4 |
| `PATCH /api/v1/admin-service/store/:store_id/state` | 큐 | 관리자 | 경로 StoreStateParamDto<br>본문 StoreStateDto | null | 업체 상태 변경 | A4 |
| `GET /api/v1/admin-service/store/application` | 동기 | 관리자 | query StoreApplicationListDto | StoreApplicationListResultDto | 입점 신청 목록 | A3 |
| `GET /api/v1/admin-service/store/application/:store_application_id` | 동기 | 관리자 | 경로 StoreApplicationDetailParamDto | StoreApplicationDetailResultDto | 입점 신청 상세 | A3 |
| `PATCH /api/v1/admin-service/store/application/:store_application_id/approve` | 큐 | 관리자 | 경로 StoreApplicationApproveParamDto | StoreApplicationApproveResultDto | 입점 승인 | A3 |
| `PATCH /api/v1/admin-service/store/application/:store_application_id/reject` | 큐 | 관리자 | 경로 StoreApplicationRejectParamDto<br>본문 StoreApplicationRejectDto | null | 입점 반려 | A3 |
| `GET /api/v1/admin-service/store/mine` | 동기 | 매니저 | — | StoreMineResultDto | 내 업체 상세 | M7 |
| `PUT /api/v1/admin-service/store/mine/breaks` | 큐 | 매니저 | 본문 StoreMineBreaksDto | null | 내 업체 브레이크타임 설정 | M7 |
| `PATCH /api/v1/admin-service/store/mine/door-secret` | 큐 | 매니저(업체 총관리자) | 본문 StoreMineDoorSecretDto | null | 내 업체 문 소켓 시크릿 코드 설정 | M7 |
| `POST /api/v1/admin-service/store/mine/file` | 큐 | 매니저 | 본문 StoreMineFileDto | StoreMineFileResultDto | 내 업체 사진 등록 | M7 |
| `DELETE /api/v1/admin-service/store/mine/file/:store_file_id` | 큐 | 매니저 | 경로 StoreMineFileDeleteParamDto | null | 내 업체 사진 삭제 | M7 |
| `PUT /api/v1/admin-service/store/mine/file/order` | 큐 | 매니저 | 본문 StoreMineFileOrderDto | null | 내 업체 사진 순서 변경 | M7 |
| `POST /api/v1/admin-service/store/mine/file/upload-url` | 동기 | 매니저 | 본문 StoreMineFileUploadUrlDto | StoreMineFileUploadUrlResultDto | 내 업체 사진 업로드 주소 | M7 |
| `PUT /api/v1/admin-service/store/mine/hours` | 큐 | 매니저 | 본문 StoreMineHoursDto | null | 내 업체 영업시간 설정 | M7 |
| `PATCH /api/v1/admin-service/store/mine/maintenance` | 큐 | 매니저 | 본문 StoreMineMaintenanceDto | null | 내 업체 정비시간 설정 | M7 |
| `PATCH /api/v1/admin-service/store/mine/open` | 큐 | 매니저 | 본문 StoreMineOpenDto | null | 내 업체 영업중 여부 변경 | M7 |
| `PATCH /api/v1/admin-service/store/mine/profile` | 큐 | 매니저 | 본문 StoreMineProfileDto | null | 내 업체 소개 수정 | M7 |
| `PATCH /api/v1/admin-service/store/mine/reservation-policy` | 큐 | 매니저 | 본문 StoreMineReservationPolicyDto | null | 내 업체 예약 · 환불 규정 설정 | M7 |
| `GET /api/v1/admin-service/store/mine/unavailable-period` | 동기 | 매니저 | query StoreMineUnavailablePeriodListDto | StoreMineUnavailablePeriodListResultDto | 내 업체 일시 예약불가 목록 | M7 |
| `POST /api/v1/admin-service/store/mine/unavailable-period` | 큐 | 매니저 | 본문 StoreMineUnavailablePeriodDto | StoreMineUnavailablePeriodResultDto | 내 업체 일시 예약불가 등록 | M7 |
| `DELETE /api/v1/admin-service/store/mine/unavailable-period/:store_unavailable_period_id` | 큐 | 매니저 | 경로 StoreMineUnavailablePeriodDeleteParamDto | null | 내 업체 일시 예약불가 삭제 | M7 |

### 객실(상품 설정 · 그룹 · 호실) — `/api/v1/admin-service/room`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `GET /api/v1/admin-service/room` | 동기 | 매니저 | query RoomListDto | RoomListResultDto | 호실 목록 | M3 · M4 |
| `POST /api/v1/admin-service/room` | 큐 | 매니저 | 본문 RoomDto | RoomResultDto | 호실 등록 | M4 |
| `PATCH /api/v1/admin-service/room/:room_id` | 큐 | 매니저 | 경로 RoomUpdateParamDto<br>본문 RoomUpdateDto | null | 호실 수정 | M4 |
| `DELETE /api/v1/admin-service/room/:room_id` | 큐 | 매니저 | 경로 RoomDeleteParamDto | null | 호실 삭제 | M4 |
| `POST /api/v1/admin-service/room/:room_id/door-open` | 동기 | 매니저 | 경로 RoomDoorOpenParamDto | RoomDoorOpenResultDto | 호실 문 바로 열기 | M4 |
| `PATCH /api/v1/admin-service/room/:room_id/state` | 큐 | 매니저 | 경로 RoomStateParamDto<br>본문 RoomStateDto | null | 호실 상태 변경 | M4 |
| `GET /api/v1/admin-service/room/group` | 동기 | 매니저 | query RoomGroupListDto | RoomGroupListResultDto | 객실 그룹 목록 | M4 · M5 |
| `POST /api/v1/admin-service/room/group` | 큐 | 매니저 | 본문 RoomGroupDto | RoomGroupResultDto | 객실 그룹 등록 | M5 |
| `GET /api/v1/admin-service/room/group/:room_group_id` | 동기 | 매니저 | 경로 RoomGroupDetailParamDto | RoomGroupDetailResultDto | 객실 그룹 상세 | M5 |
| `PATCH /api/v1/admin-service/room/group/:room_group_id` | 큐 | 매니저 | 경로 RoomGroupUpdateParamDto<br>본문 RoomGroupUpdateDto | null | 객실 그룹 수정 | M5 |
| `DELETE /api/v1/admin-service/room/group/:room_group_id` | 큐 | 매니저 | 경로 RoomGroupDeleteParamDto | null | 객실 그룹 삭제 | M5 |
| `POST /api/v1/admin-service/room/group/:room_group_id/image` | 큐 | 매니저 | 경로 RoomGroupImageParamDto<br>본문 RoomGroupImageDto | RoomGroupImageResultDto | 객실 그룹 사진 등록 | M5 |
| `DELETE /api/v1/admin-service/room/group/:room_group_id/image/:room_group_image_id` | 큐 | 매니저 | 경로 RoomGroupImageDeleteParamDto | null | 객실 그룹 사진 삭제 | M5 |
| `PUT /api/v1/admin-service/room/group/:room_group_id/image/order` | 큐 | 매니저 | 경로 RoomGroupImageOrderParamDto<br>본문 RoomGroupImageOrderDto | null | 객실 그룹 사진 순서 변경 | M5 |
| `POST /api/v1/admin-service/room/group/:room_group_id/image/upload-url` | 동기 | 매니저 | 경로 RoomGroupImageUploadUrlParamDto<br>본문 RoomGroupImageUploadUrlDto | RoomGroupImageUploadUrlResultDto | 객실 그룹 사진 업로드 주소 | M5 |
| `PATCH /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id` | 큐 | 매니저 | 경로 RoomGroupPlanUpdateParamDto<br>본문 RoomGroupPlanUpdateDto | null | 그룹 상품 수정 | M5 |
| `GET /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price` | 동기 | 매니저 | 경로 RoomGroupPlanPriceListParamDto<br>query RoomGroupPlanPriceListDto | RoomGroupPlanPriceListResultDto | 상품별 기간 가격 목록 | M5 |
| `POST /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price` | 큐 | 매니저 | 경로 RoomGroupPlanPriceParamDto<br>본문 RoomGroupPlanPriceDto | RoomGroupPlanPriceResultDto | 상품별 기간 가격 등록 | M5 |
| `PATCH /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id` | 큐 | 매니저 | 경로 RoomGroupPlanPriceUpdateParamDto<br>본문 RoomGroupPlanPriceUpdateDto | null | 상품별 기간 가격 수정 | M5 |
| `DELETE /api/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id` | 큐 | 매니저 | 경로 RoomGroupPlanPriceDeleteParamDto | null | 상품별 기간 가격 삭제 | M5 |
| `GET /api/v1/admin-service/room/plan` | 동기 | 매니저 | — | RoomPlanListResultDto | 업체 상품 설정 목록 | M6 |
| `PATCH /api/v1/admin-service/room/plan/:room_plan_type_id` | 큐 | 매니저 | 경로 RoomPlanUpdateParamDto<br>본문 RoomPlanUpdateDto | null | 업체 상품 설정 수정 | M6 |

### 업체 예약 현황 — `/api/v1/admin-service/reservation`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `PATCH /api/v1/admin-service/reservation/:reservation_id/room` | 큐 | 매니저 | 경로 ReservationRoomChangeParamDto<br>본문 ReservationRoomChangeDto | null | 예약 호실 이동 | M3 |
| `PATCH /api/v1/admin-service/reservation/:reservation_id/store-cancel` | 큐 | 매니저 | 경로 ReservationStoreCancelParamDto<br>본문 ReservationStoreCancelDto | null | 업체 예약 취소 | M3 |
| `POST /api/v1/admin-service/reservation/:reservation_id/use-cancel-request` | 큐 | 매니저 | 경로 ReservationUseCancelRequestParamDto<br>본문 ReservationUseCancelRequestDto | ReservationUseCancelRequestResultDto | 이용 중 취소 요청 | M3 |
| `GET /api/v1/admin-service/reservation/store` | 동기 | 매니저 | query ReservationStoreDto | ReservationStoreResultDto | 내 업체 예약 현황 | M3 |

### 이용자 관리 — `/api/v1/admin-service/user`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `GET /api/v1/admin-service/user` | 동기 | 관리자 | query UserListDto | UserListResultDto | 이용자 목록 | A6 |
| `GET /api/v1/admin-service/user/:user_id` | 동기 | 관리자 | 경로 UserDetailParamDto | UserDetailResultDto | 이용자 상세 | A6 |
| `GET /api/v1/admin-service/user/:user_id/reservation` | 동기 | 관리자 | 경로 UserReservationListParamDto<br>query UserReservationListDto | UserReservationListResultDto | 이용자 예약 이력 | A6 |
| `PATCH /api/v1/admin-service/user/:user_id/state` | 큐 | 관리자 | 경로 UserStateParamDto<br>본문 UserStateDto | null | 이용자 이용 제한 · 해제 | A6 |

### 통계 — `/api/v1/admin-service/stats`

| 메서드 · 주소 | 방식 | 로그인 | 요청 | 응답(큐는 done 의 data) | 하는 일 | 쓰는 화면 |
|---|---|---|---|---|---|---|
| `GET /api/v1/admin-service/stats` | 동기 | 관리자 | query StatsDto | StatsResultDto | 전체 통계 | A2 |
| `GET /api/v1/admin-service/stats/mine` | 동기 | 매니저 | query StatsMineDto | StatsMineResultDto | 내 업체 통계 | M2 |
