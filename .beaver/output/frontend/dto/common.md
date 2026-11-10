# DTO — 공통

> 여러 도메인 DTO 가 같이 쓰는 것 — 목록 페이지 · 실패 본문 · 권한 · 큐 응답(SSE) 이벤트 이름 · 예약 · 결제 상태 값 · 룩업 값. 원본에서 Swagger 데코레이터만 뺀 사본(기준: 백엔드 Phase 27(2026-11-10)). 프론트에는 `contracts/common/<파일>` 로 둔다 — 도메인 DTO 의 `'../../common/pagination.dto'` import 가 이 자리를 가리킨다.

## common/pagination.dto.ts

원본 `libs/common/src/dto/pagination.dto.ts` — 목록 요청 query 의 부모와 목록 응답의 `pagination`.

```ts
import {IsOptional} from 'class-validator';

/** 페이지 기본값 */
export const PAGINATION_DEFAULTS = {all_search_yn: 'N', page: 1, size: 20, page_size: 10} as const;

/**
 * 목록 query 의 부모 — 목록 DTO 는 이것을 extends 하고 자기 필드만 더한다. 값은 query 문자열로 보낸다
 */
export class PaginationDto {
    /** 전체 조회 여부(Y/N) — Y 면 페이지 없이 전부. 기본값 N */
    @IsOptional()
    all_search_yn: string;

    /** 페이지. 기본값 1 */
    @IsOptional()
    page: number;

    /** 페이지당 개수. 기본값 20 */
    @IsOptional()
    size: number;

    /** 페이지 탭에 보일 페이지 수. 기본값 10 */
    @IsOptional()
    page_size: number;

    /**
     * @param data 요청 쿼리 — 빠진 값은 PAGINATION_DEFAULTS
     */
    constructor(data?: Partial<PaginationDto>) {
        this.all_search_yn = data?.all_search_yn ?? PAGINATION_DEFAULTS.all_search_yn;
        this.page = data?.page ?? PAGINATION_DEFAULTS.page;
        this.size = data?.size ?? PAGINATION_DEFAULTS.size;
        this.page_size = data?.page_size ?? PAGINATION_DEFAULTS.page_size;
    }
}

/** 페이지 탭에 보일 페이지 번호 범위 */
export class PageRangeResultDto {
    /** 시작 페이지 */
    start: number;

    /** 끝 페이지 */
    end: number;
}

/** 목록 응답 `{list, pagination}` 의 pagination */
export class PaginationResultDto {
    /** 전체 조회 여부(Y/N) */
    all_search_yn: 'Y' | 'N';

    /** 총 개수 */
    total_count: number;

    /** 현재 페이지 (범위를 벗어난 요청은 바로잡은 값) */
    page: number;

    /** 마지막 페이지 (0건이어도 1) */
    max_page: number;

    /** 페이지 탭에 보일 페이지 번호 범위 */
    page_range: PageRangeResultDto;

    /** 이 페이지 첫 항목의 번호 — 총 개수부터 내려간다 */
    content_start_number: number;

    /** 이 페이지 첫 항목의 번호 — 1부터 올라간다 */
    content_start_number_reverse: number;
}
```

## common/fail-result.dto.ts

원본 `libs/common/src/dto/global.result.dto.ts` — 모든 실패의 본문(동기 응답 본문 · 큐 응답의 `failed` 이벤트 data 같은 모양). 기능별 추가 필드는 이 두 필드 옆에 함께 온다(예: 결제 실패 `payment_error_code`).

```ts
/** 입력 칸 오류 1건 — 그 칸 옆에 message 를 보여 준다 */
export class ValidationErrorResultDto {
    /** 오류가 난 입력 필드 이름(중첩은 점 경로 — hours.0.open_time) */
    property: string;

    /** 보여 줄 메시지 */
    message: string;
}

/** 모든 실패의 본문 */
export class ApiFailResultDto {
    /** 보여 줄 메시지 */
    message: string;

    /** 입력 칸 오류 목록 — 입력 칸 오류가 아니면 null */
    validation_errors: ValidationErrorResultDto[] | null;
}

/** 큐 응답의 failed 이벤트 data — 실패 본문 + 상태 코드 */
export type CommandFailedEventData = ApiFailResultDto & {status_code: number} & Record<string, unknown>;
```

## common/roles.ts

원본 `libs/contracts/src/roles.ts` — 로그인 결과의 `auth_id`(매니저 · 관리자)로 메뉴를 가른다.

```ts
/** 회원 권한 — 업체 총관리자(HEAD_MANAGER)만 업체 관리자 관리 · 문 시크릿 설정 */
export const AUTH_ID = {SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN', HEAD_MANAGER: 'HEAD_MANAGER', MANAGER: 'MANAGER', USER: 'USER'} as const;

/** 로그인 그룹 — 그룹마다 로그인 · 재발급 API 와 토큰이 따로다 */
export const LOGIN_SCOPE = {USER: 'USER', MANAGER: 'MANAGER', ADMIN: 'ADMIN'} as const;

/** 로그인 그룹 값 */
export type LoginScope = (typeof LOGIN_SCOPE)[keyof typeof LOGIN_SCOPE];
```

## common/sse.ts

원본 `libs/contracts/src/message-envelope.ts` 의 `COMMAND_STREAM_EVENT` — 큐 API 응답(`text/event-stream`)의 이벤트 이름.

```ts
/** 큐 API 응답 이벤트 — accepted 뒤에 done · failed · pending 중 하나가 오고 스트림이 끝난다 */
export const COMMAND_STREAM_EVENT = {
    /** 접수됨 — data: `{request_id}` */
    ACCEPTED: 'accepted',
    /** 성공 — data: 그 API 의 응답 DTO (없으면 null) */
    DONE: 'done',
    /** 실패 — data: `{status_code, message, validation_errors, ...}` */
    FAILED: 'failed',
    /** 30초 안에 결과가 오지 않음 — data: `{request_id, message}`. 처리됐을 수 있으니 그 리소스를 다시 조회한다 */
    PENDING: 'pending',
} as const;
```

## common/reservation.constants.ts

원본 `libs/contracts/src/reservation/reservation.constants.ts` 에서 화면이 쓰는 값만.

```ts
/** 예약 상태 — 예약 · 구간 */
export const RESERVATION_STATE = {PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', CHECKED_IN: 'CHECKED_IN', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED', EXPIRED: 'EXPIRED'} as const;

/** 예약 구간 종류 — 기본 · 연장 */
export const RESERVATION_DETAIL_TYPE = {BASE: 'BASE', EXTENSION: 'EXTENSION'} as const;

/** 결제 상태 */
export const PAYMENT_STATE = {READY: 'READY', DONE: 'DONE', FAILED: 'FAILED', EXPIRED: 'EXPIRED', REFUND_REQUESTED: 'REFUND_REQUESTED', REFUNDED: 'REFUNDED', REFUND_FAILED: 'REFUND_FAILED'} as const;

/** 취소 주체 — USER: 이용자, STORE: 업체 */
export const RESERVATION_CANCEL_ACTOR = {USER: 'USER', STORE: 'STORE'} as const;

/** 결제 대기 유지 시간(분) — 예약 · 연장 신청 뒤 이 시간 안에 결제가 확인되지 않으면 만료 */
export const RESERVATION_PAYMENT_PENDING_MINUTES = 5;

/** 결제 대기 만료 뒤 같은 이용자가 같은 호실을 다시 예약할 수 없는 시간(분) — 만료 시각부터 */
export const RESERVATION_REBOOK_BLOCK_MINUTES = 10;

/** 이용 중 취소 요청 상태 — 요청 중인데 만료 시각이 지나면 만료로 본다 */
export const RESERVATION_CANCEL_REQUEST_STATE = {REQUESTED: 'REQUESTED', APPROVED: 'APPROVED', REJECTED: 'REJECTED', EXPIRED: 'EXPIRED'} as const;

/** 이용 중 취소 요청 유효 시간(분) — 예약 끝이 먼저면 예약 끝까지 */
export const RESERVATION_CANCEL_REQUEST_MINUTES = 10;
```

## 룩업 값

응답에 `*_name` 이 함께 오는 곳은 그 이름을 쓰고, ID 만 오는 곳(예: 회원 `state_id`, 업체 `store_state_id`)은 아래 이름으로 보여 준다.

| 구분 | 값 → 이름 |
|---|---|
| 권한 `auth_id` | SUPER_ADMIN 총괄관리자 · ADMIN 관리자 · HEAD_MANAGER 총괄매니저(업체 총관리자) · MANAGER 매니저(업체 관리자) · USER 이용자 |
| 회원 상태 `state_id` | ACTIVE 정상 · BLOCK 정지(이용 제한) · LEAVE_WAIT 탈퇴 대기 · LEAVE 탈퇴 |
| SNS `sns_id` | GOOGLE 구글 · FACEBOOK 페이스북 · APPLE 애플 · KAKAO 카카오 · LINE 라인 · NAVER 네이버 (로그인 · 가입은 KAKAO · NAVER 만) |
| 성별 `gender` | M 남 · F 여 |
| 업체 상태 `store_state_id` | ACTIVE 활성 · SUSPEND 영업중지 · LEAVE 탈퇴 |
| 입점 신청 상태 `store_application_state_id` | WAIT 대기 · APPROVED 승인 · REJECTED 반려 |
| 업체 파일 용도 `store_file_purpose_id` | BUSINESS_LICENSE 사업자등록증(비공개 — 10분짜리 열람 주소) · STORE_IMAGE 업체 사진(공개) |
| 호실 상태 `room_state_id` | AVAILABLE 예약가능 · RESERVED 예약완료 · IN_USE 사용중 · MAINTENANCE 정비중 · DISABLED 사용중지 (업체가 바꿀 수 있는 값은 AVAILABLE · DISABLED) |
| 문 상태 `door_state` | open 열림 · close 닫힘 |
| 상품 종류 `room_plan_type_id` | HOURLY 시간 이용 · NIGHT 1박 · LONG 연박 |
| 예약 상태 `reservation_state_id` | PENDING 결제 대기 · CONFIRMED 예약 확정 · CHECKED_IN 이용 중 · COMPLETED 이용 완료 · CANCELED 취소 · EXPIRED 결제 대기 만료 |
| 구간 종류 `reservation_detail_type_id` | BASE 기본 · EXTENSION 연장 |
| 취소 주체 `cancel_actor` | USER 이용자 · STORE 업체 |
| 이용 중 취소 요청 상태 | REQUESTED 요청 중 · APPROVED 승인 · REJECTED 거절 · EXPIRED 만료 |
| 결제 상태 `payment_state_id` | READY 결제 대기 · DONE 결제 완료 · FAILED 결제 실패 · EXPIRED 결제 만료 · REFUND_REQUESTED 환불 신청 · REFUNDED 환불 완료 · REFUND_FAILED 환불 실패 |
| 결제 환경 `environment` | LIVE 실결제 · TEST 테스트 결제 |
| 요일 `day_of_week` · `days_of_week` | 0 일 ~ 6 토. `days_of_week` 는 비트 합(`1 << 요일`, 매일 127) |
| 여부 값 `is_*` · `has_*` | 1 예 · 0 아니오 |
