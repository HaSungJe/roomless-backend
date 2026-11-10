# DTO — reservation

> `libs/contracts/src/reservation/dto/` 에서 Swagger 데코레이터(`@nestjs/swagger`)만 뺀 사본 — 기준: 백엔드 Phase 27(2026-11-10). `class-validator` · `class-transformer` 데코레이터와 한국어 메시지는 그대로다(화면 입력 검증에 그대로 쓴다). 프론트에는 `contracts/reservation/dto/<파일>` 로 둔다. 이후 바뀐 DTO 는 `changes/` 로 온다.

## reservation/dto/reservation-availability.dto.ts

```ts
import {IsIn, IsNotEmpty, IsOptional, Matches, ValidateIf} from 'class-validator';

/**
 * 객실 그룹별 예약 가능 시간 query — 업체 · 날짜(한국 날짜) · 상품, 그룹 필터(선택). 연박은 박수가 필수다. 쿼리 값은 문자열이다.
 */
export class ReservationAvailabilityDto {
    /** 업체 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;

    /** 날짜 (YYYY-MM-DD, 한국 날짜 — 시간 이용은 시작일, 1박 · 연박은 입실일) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    /** 상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) — 값: HOURLY · NIGHT · LONG */
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    /** 박수 — 연박(LONG)이면 필수(업체 설정 최소 ~ 최대 박수), 그 밖은 무시 */
    @ValidateIf((dto: ReservationAvailabilityDto) => dto.room_plan_type_id === 'LONG')
    @Matches(/^\d{1,3}$/, {message: '박수를 숫자로 입력해주세요.'})
    @IsNotEmpty({message: '연박은 박수를 입력해주세요.'})
    nights: string | null;

    /** 객실 그룹 ID — 그 그룹만(선택, 업체에 없는 그룹이면 빈 목록) */
    @IsOptional()
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    room_group_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 값은 빈 문자열(검증에서 걸린다), 박수 · 그룹은 null
     */
    constructor(data?: Partial<ReservationAvailabilityDto>) {
        this.store_id = data?.store_id ?? '';
        this.date = data?.date ?? '';
        this.room_plan_type_id = data?.room_plan_type_id ?? '';
        this.nights = data?.nights ?? null;
        this.room_group_id = data?.room_group_id ?? null;
    }
}

/**
 * 예약 가능한 호수 1개
 */
export class ReservationAvailabilityRoomResultDto {
    /** 호실 ID */
    room_id: string;

    /** 호실명 */
    room_name: string;

    /** 층 (지하는 음수) */
    floor: number;
}

/**
 * 시간대 1개 — 예약 가능한 호수가 1개 이상인 것만 나온다
 */
export class ReservationAvailabilitySlotResultDto {
    /** 시작(입실) 일시 (ISO 8601) */
    start_at: string;

    /** 끝(퇴실) 일시 (ISO 8601) */
    end_at: string;

    /** 지금 바로 여부 (1: 지금(분 단위)부터 — 시간 이용 · 오늘만, 예약 생성 때 is_now: 1 / 0: 30분 단위 시작 · 입실 시각) */
    is_now: number;

    /** 이 시간대에 예약 가능한 호수 (층 · 호실명 순) */
    rooms: ReservationAvailabilityRoomResultDto[];
}

/**
 * 객실 그룹 1개 — 이 상품을 파는 그룹(그룹 상품 판매 · 요금 > 0)만 나온다. 예약할 수 있는 시간대가 없으면 slots 가 빈 배열이다
 */
export class ReservationAvailabilityGroupResultDto {
    /** 객실 그룹 ID */
    room_group_id: string;

    /** 객실 그룹명 */
    room_group_name: string;

    /** 금액(원) — 시간 이용 1회 · 1박 · 연박 박수 합계(기간 가격 반영) */
    price: number;

    /** 시간대 (시작 순 — 지금 바로가 맨 앞, 시간 이용은 30분 단위) */
    slots: ReservationAvailabilitySlotResultDto[];
}

/**
 * 객실 그룹별 예약 가능 시간
 */
export class ReservationAvailabilityResultDto {
    /** 상품 종류 */
    room_plan_type_id: string;

    /** 날짜 (YYYY-MM-DD) */
    date: string;

    /** 박수 — 연박만, 그 밖은 null */
    nights: number | null;

    /** 객실 그룹 목록 (그룹명 순) */
    list: ReservationAvailabilityGroupResultDto[];
}
```

## reservation/dto/reservation-cancel-request-approve.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 이용 중 취소 요청 승인 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationCancelRequestApproveParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 이용 중 취소 요청 승인 결과 — 예약은 업체 취소, 결제는 전액 환불 신청(백그라운드에서 토스로)
 */
export class ReservationCancelRequestApproveResultDto {
    /** 환불 금액(원) — 결제 완료 금액 전액 */
    refund_amount: number;
}
```

## reservation/dto/reservation-cancel-request-reject.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 이용 중 취소 요청 거절 path param — 내 예약만(남의 예약은 404). 거절하면 요청만 끝나고 예약은 그대로다
 */
export class ReservationCancelRequestRejectParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}
```

## reservation/dto/reservation-cancel-request.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 예약의 이용 중 취소 요청 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationCancelRequestParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 내 예약의 이용 중 취소 요청 — 그 예약의 마지막 요청(SMS 링크 화면)
 */
export class ReservationCancelRequestResultDto {
    /** 취소 요청 ID */
    reservation_cancel_request_id: string;

    /** 요청 상태 (REQUESTED: 요청 중 — 승인 · 거절할 수 있다, APPROVED: 승인, REJECTED: 거절, EXPIRED: 만료) */
    reservation_cancel_request_state_id: string;

    /** 상호명 */
    store_name: string;

    /** 호실명 */
    room_name: string;

    /** 업체가 적은 취소 사유 */
    cancel_reason: string;

    /** 승인하면 환불받는 금액(원) — 결제 완료 금액 전액 */
    refund_amount: number;

    /** 만료 일시 (ISO 8601) — 이 시각부터 승인 · 거절할 수 없다 */
    expires_at: string;

    /** 요청 일시 (ISO 8601) */
    created_at: string;
}
```

## reservation/dto/reservation-cancel.dto.ts

```ts
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 이용자 취소 path param
 */
export class ReservationCancelParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 이용자 취소 — 사유 메모 필수. 환불 마감 전 100%, 마감 뒤 ~ 이용 시작 전은 예약 때 업체 비율, 시작 뒤에는 취소할 수 없다
 */
export class ReservationCancelDto {
    /** 취소 사유 (255자) */
    @MaxLength(255, {message: '취소 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '취소 사유를 입력해주세요.'})
    cancel_reason: string;
}

/**
 * 이용자 취소 결과
 */
export class ReservationCancelResultDto {
    /** 환불 금액(원) — 백그라운드에서 토스로 환불한다. 0 은 환불 없이 취소, 결제 대기 예약 취소는 null */
    refund_amount: number | null;
}
```

## reservation/dto/reservation-detail.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 예약 상세 path param
 */
export class ReservationDetailParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 구간의 결제
 */
export class ReservationPaymentResultDto {
    /** 결제 ID (토스 orderId) */
    payment_id: string;

    /** 결제 상태 (READY · DONE · FAILED · EXPIRED · REFUND_REQUESTED · REFUNDED · REFUND_FAILED) */
    payment_state_id: string;

    /** 결제 상태명 */
    payment_state_name: string;

    /** 결제 금액(원) */
    amount: number;

    /** 결제 수단 — 승인 전이면 null */
    method: string | null;

    /** 승인 일시 (ISO 8601) — 승인 전이면 null */
    approved_at: string | null;

    /** 영수증 주소 — 없으면 null */
    receipt_url: string | null;

    /** 환불 금액(원) — 환불이 없으면 null */
    refund_amount: number | null;

    /** 환불 완료 일시 (ISO 8601) — 없으면 null */
    refunded_at: string | null;
}

/**
 * 예약 구간 1개 — 기본 1 + 연장 n
 */
export class ReservationSegmentResultDto {
    /** 구간 ID */
    reservation_detail_id: string;

    /** 구간 종류 (BASE: 기본, EXTENSION: 연장) */
    reservation_detail_type_id: string;

    /** 구간 종류명 */
    reservation_detail_type_name: string;

    /** 구간 상태 (PENDING · CONFIRMED · CANCELED · EXPIRED) */
    reservation_state_id: string;

    /** 구간 시작 (ISO 8601) */
    start_at: string;

    /** 구간 끝 (ISO 8601) */
    end_at: string;

    /** 구간 금액(원) */
    price: number;

    /** 결제 대기 만료 일시 (ISO 8601) — 없으면 null */
    expires_at: string | null;

    /** 결제 */
    payment: ReservationPaymentResultDto;
}

/**
 * 내 예약 상세 — 결제 대기 만료 건은 404
 */
export class ReservationDetailResultDto {
    /** 예약 ID */
    reservation_id: string;

    /** 업체 ID */
    store_id: string;

    /** 상호명 */
    store_name: string;

    /** 호실 ID */
    room_id: string;

    /** 호실명 */
    room_name: string;

    /** 객실 그룹명 */
    room_group_name: string;

    /** 상품 종류 (HOURLY · NIGHT · LONG) */
    room_plan_type_id: string;

    /** 상품 종류명 */
    room_plan_type_name: string;

    /** 예약 상태 */
    reservation_state_id: string;

    /** 예약 상태명 */
    reservation_state_name: string;

    /** 이용 시작 일시 (ISO 8601 — 이 시각에 이용 중) */
    start_at: string;

    /** 이용 끝 일시 (ISO 8601 — 이 시각에 이용 완료) */
    end_at: string;

    /** 합계 금액(원) */
    total_price: number;

    /** 100% 환불 마감 일시 (ISO 8601) */
    refund_deadline_at: string;

    /** 예약한 호실이 사용중지인지 (0 · 1) — 1 이면 확정 · 이용 중 예약을 끝 전까지 전액 환불로 취소할 수 있다 */
    is_room_disabled: number;

    /** 마감 뒤 환불 비율(%) */
    late_refund_percent: number;

    /** 취소 일시 (ISO 8601) — 취소가 아니면 null */
    canceled_at: string | null;

    /** 취소 주체 (USER: 이용자, STORE: 업체) — 취소가 아니면 null */
    cancel_actor: string | null;

    /** 취소 사유 — 취소가 아니면 null */
    cancel_reason: string | null;

    /** 등록일시 (ISO 8601) */
    created_at: string;

    /** 구간 (시작 순) */
    segments: ReservationSegmentResultDto[];
}
```

## reservation/dto/reservation-extend.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 연장 신청 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationExtendParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 연장 신청 결과 — 연장 구간을 잡아 뒀다. 프론트는 payment_id 를 토스 orderId 로 결제창을 열고, 승인 뒤 기존 결제 확인 API 를 부른다(결제 대기 만료 전까지)
 */
export class ReservationExtendResultDto {
    /** 예약 ID */
    reservation_id: string;

    /** 연장 구간 ID */
    reservation_detail_id: string;

    /** 결제 ID — 토스 orderId */
    payment_id: string;

    /** 주문명 — 토스 orderName */
    order_name: string;

    /** 결제 금액(원) — 토스 amount */
    amount: number;

    /** 결제 대기 만료 일시 (ISO 8601 — 이때까지 결제가 확인되지 않으면 만료, 그 예약은 다시 연장할 수 없다) */
    expires_at: string;

    /** 연장 시작 일시 (ISO 8601 — 지금 끝) */
    start_at: string;

    /** 연장 뒤 끝 일시 (ISO 8601) */
    end_at: string;
}
```

## reservation/dto/reservation-extension.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 연장 조회 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationExtensionParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 연장 조회 — 지금 끝에서 한 단위(시간 이용 · 1박: 업체 이용 시간, 연박: 1일) 늘리면 몇 시까지 · 얼마인지, 못 하면 사유. 잡아 두지 않는다
 */
export class ReservationExtensionResultDto {
    /** 예약 ID */
    reservation_id: string;

    /** 연장할 수 있는지 (0 · 1) */
    is_extendable: number;

    /** 연장할 수 없는 사유 — 할 수 있으면 null */
    reason: string | null;

    /** 요금 상품 (HOURLY: 시간 이용 요금 — 시간 이용 · 1박, NIGHT: 1박 요금 — 연박) — 계산할 수 없으면 null */
    room_plan_type_id: string | null;

    /** 연장 시작 일시 (ISO 8601 — 지금 끝) — 계산할 수 없으면 null */
    start_at: string | null;

    /** 연장 뒤 끝 일시 (ISO 8601) — 계산할 수 없으면 null */
    end_at: string | null;

    /** 연장 금액(원) — 계산할 수 없으면 null */
    amount: number | null;
}
```

## reservation/dto/reservation-list.dto.ts

```ts
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 내 예약 목록 query — 페이지만. 결제 대기 만료 건은 나오지 않는다, 입실 일시 최근순
 */
export class ReservationListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<ReservationListDto>) {
        super(data);
    }
}

/**
 * 내 예약 목록 항목
 */
export class ReservationListItemResultDto {
    /** 예약 ID */
    reservation_id: string;

    /** 업체 ID */
    store_id: string;

    /** 상호명 */
    store_name: string;

    /** 호실 ID */
    room_id: string;

    /** 호실명 */
    room_name: string;

    /** 객실 그룹명 */
    room_group_name: string;

    /** 상품 종류 (HOURLY · NIGHT · LONG) */
    room_plan_type_id: string;

    /** 상품 종류명 */
    room_plan_type_name: string;

    /** 예약 상태 (PENDING: 결제 대기, CONFIRMED: 예약 확정, CHECKED_IN: 이용 중, COMPLETED: 이용 완료, CANCELED: 취소) */
    reservation_state_id: string;

    /** 예약 상태명 */
    reservation_state_name: string;

    /** 이용 시작 일시 (ISO 8601 — 이 시각에 이용 중) */
    start_at: string;

    /** 이용 끝 일시 (ISO 8601 — 이 시각에 이용 완료) */
    end_at: string;

    /** 합계 금액(원) */
    total_price: number;

    /** 100% 환불 마감 일시 (ISO 8601) */
    refund_deadline_at: string;

    /** 예약한 호실이 사용중지인지 (0 · 1) — 1 이면 확정 · 이용 중 예약을 끝 전까지 전액 환불로 취소할 수 있다 */
    is_room_disabled: number;

    /** 등록일시 (ISO 8601) */
    created_at: string;
}

/**
 * 내 예약 목록
 */
export class ReservationListResultDto {
    /** 목록 (입실 일시 최근순) */
    list: ReservationListItemResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}
```

## reservation/dto/reservation-payment-confirm.dto.ts

```ts
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 결제 확인 — 프론트가 토스 승인 뒤 받은 결제 키와 우리 결제 ID(토스 orderId). 금액은 서버가 토스에서 다시 읽어 대조한다(프론트 값은 믿지 않는다)
 */
export class ReservationPaymentConfirmDto {
    /** 결제 ID (토스 orderId) */
    @Matches(/^[a-f0-9]{32}$/, {message: '결제 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '결제 ID를 입력해주세요.'})
    payment_id: string;

    /** 토스 결제 키 (paymentKey, 200자) */
    @MaxLength(200, {message: '결제 키는 200자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '결제 키를 입력해주세요.'})
    payment_key: string;
}

/**
 * 결제 확인 결과
 */
export class ReservationPaymentConfirmResultDto {
    /** 예약 ID */
    reservation_id: string;

    /** 예약 상태 (CONFIRMED: 예약 확정, CHECKED_IN: 이미 시작한 예약이면 이용 중 — 같은 결제를 다시 확인하면 지금 상태) */
    reservation_state_id: string;
}
```

## reservation/dto/reservation-qr.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 예약 QR path — 내 예약만(남의 예약은 404)
 */
export class ReservationQrParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 내 예약 QR — 이용 시간에만 볼 수 있고, 유효 끝(이용 끝)이 지나면 그 QR 로는 열리지 않는다
 */
export class ReservationQrResultDto {
    /** 예약 ID */
    reservation_id: string;

    /** 호실 ID */
    room_id: string;

    /** QR 정보 (32자 — 화면에 QR 로 그려 문에 댄다) */
    qr: string;

    /** QR 유효 시작 (ISO 8601 — 이용 시작) */
    qr_starts_at: string;

    /** QR 유효 끝 (ISO 8601 — 이용 끝, 이 시각부터 쓸 수 없다) */
    qr_ends_at: string;
}
```

## reservation/dto/reservation-room-change.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 이동 path param — 내 업체 예약만(아니면 404)
 */
export class ReservationRoomChangeParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 호실 이동 — 같은 객실 그룹의 다른 호실로(이용 시작 전 확정 예약만). 금액 · 시간은 그대로
 */
export class ReservationRoomChangeDto {
    /** 옮길 호실 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '옮길 호실 ID를 입력해주세요.'})
    room_id: string;
}
```

## reservation/dto/reservation-store-cancel.dto.ts

```ts
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 취소 path param — 내 업체 예약만(아니면 404)
 */
export class ReservationStoreCancelParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 업체 취소 — 사유 메모 필수(이용자 SMS 에 함께 나간다). 확정 예약은 100% 환불
 */
export class ReservationStoreCancelDto {
    /** 취소 사유 (255자) */
    @MaxLength(255, {message: '취소 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '취소 사유를 입력해주세요.'})
    cancel_reason: string;
}
```

## reservation/dto/reservation-store.dto.ts

```ts
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 예약 현황 query — 날짜(한국 날짜) 하루와 겹치는 예약을 호실별로
 */
export class ReservationStoreDto {
    /** 날짜 (YYYY-MM-DD, 한국 날짜) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    /**
     * @param data 요청 쿼리 — 빠진 날짜는 빈 문자열(검증에서 걸린다)
     */
    constructor(data?: Partial<ReservationStoreDto>) {
        this.date = data?.date ?? '';
    }
}

/**
 * 호실의 예약 1건
 */
export class ReservationStoreItemResultDto {
    /** 예약 ID */
    reservation_id: string;

    /** 예약 상태 (PENDING · CONFIRMED · CHECKED_IN · COMPLETED) */
    reservation_state_id: string;

    /** 예약 상태명 */
    reservation_state_name: string;

    /** 상품 종류 (HOURLY · NIGHT · LONG) */
    room_plan_type_id: string;

    /** 상품 종류명 */
    room_plan_type_name: string;

    /** 입실 일시 (ISO 8601) */
    start_at: string;

    /** 퇴실 일시 (ISO 8601) */
    end_at: string;

    /** 점유 끝 (ISO 8601 — 퇴실 + 정비시간) */
    blocked_until: string;

    /** 합계 금액(원) */
    total_price: number;

    /** 이용자 이름 */
    user_name: string;

    /** 이용자 휴대폰 번호 — 인증 전이면 null */
    user_phone: string | null;

    /** 마지막 이용 중 취소 요청 상태 (REQUESTED: 요청 중, APPROVED: 승인, REJECTED: 거절, EXPIRED: 만료 — 요청 중인데 10분이 지나면 만료) — 요청이 없으면 null */
    cancel_request_state_id: string | null;

    /** 마지막 이용 중 취소 요청 일시 (ISO 8601) — 요청이 없으면 null */
    cancel_request_created_at: string | null;
}

/**
 * 호실 1개와 그날 예약
 */
export class ReservationStoreRoomResultDto {
    /** 호실 ID */
    room_id: string;

    /** 호실명 */
    room_name: string;

    /** 층 */
    floor: number;

    /** 객실 그룹 ID */
    room_group_id: string;

    /** 객실 그룹명 */
    room_group_name: string;

    /** 호실 상태 (AVAILABLE · RESERVED · IN_USE · MAINTENANCE · DISABLED) */
    room_state_id: string;

    /** 호실 상태명 */
    room_state_name: string;

    /** 그날 예약 (입실 순) */
    reservations: ReservationStoreItemResultDto[];
}

/**
 * 내 업체 예약 현황
 */
export class ReservationStoreResultDto {
    /** 날짜 (YYYY-MM-DD) */
    date: string;

    /** 호실 목록 (층 · 호실명 순 — 지워지지 않은 호실) */
    list: ReservationStoreRoomResultDto[];
}
```

## reservation/dto/reservation-use-cancel-request.dto.ts

```ts
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 이용 중 취소 요청 path param — 내 업체 예약만(남의 업체 예약은 404)
 */
export class ReservationUseCancelRequestParamDto {
    /** 예약 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 이용 중 취소 요청 — 이용 중인 예약을 예약자 동의로 취소한다. 예약자에게 승인 링크 SMS 가 가고, 10분(예약 끝이 먼저면 예약 끝) 안에 승인하면 전액 환불로 취소된다
 */
export class ReservationUseCancelRequestDto {
    /** 취소 사유 (255자) — 예약자 승인 화면에 보이고, 승인하면 예약의 취소 사유 */
    @MaxLength(255, {message: '취소 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '취소 사유를 입력해주세요.'})
    cancel_reason: string;
}

/**
 * 이용 중 취소 요청 결과 — 승인 · 거절 결과는 업체 예약 현황의 cancel_request_state_id 로 본다
 */
export class ReservationUseCancelRequestResultDto {
    /** 취소 요청 ID */
    reservation_cancel_request_id: string;

    /** 만료 일시 (ISO 8601) — 요청 + 10분, 예약 끝이 먼저면 예약 끝 */
    expires_at: string;
}
```

## reservation/dto/reservation.dto.ts

```ts
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, Min, ValidateIf} from 'class-validator';

/**
 * 예약 생성 — 호실 · 상품 · 날짜(한국 날짜). 시간 이용은 시작 시각(30분 단위) 또는 지금 바로(is_now 1 — 오늘만), 연박은 박수가 필수다. 금액은 서버가 계산한다
 */
export class ReservationDto {
    /** 호실 ID */
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;

    /** 상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박) — 값: HOURLY · NIGHT · LONG */
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    /** 날짜 (YYYY-MM-DD, 한국 날짜 — 시간 이용은 시작일, 1박 · 연박은 입실일) */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    /** 지금 바로 이용 (1: 지금(분 단위 내림)부터 이용 시간만큼 — 시간 이용 · 오늘 날짜만, 시작 시각은 보내지 않는다 / 0 또는 생략: 시작 시각대로) — 값: 0 · 1 */
    @IsOptional()
    @IsIn([0, 1], {message: '지금 바로 이용 여부가 올바르지 않습니다.'})
    is_now?: number;

    /** 시작 시각 (HH:mm — 00분 · 30분, 한국 시각) — 시간 이용이면 필수(지금 바로는 빼고), 그 밖은 무시 */
    @ValidateIf((dto: ReservationDto) => dto.room_plan_type_id === 'HOURLY' && dto.is_now !== 1)
    @Matches(/^([01]\d|2[0-3]):(00|30)$/, {message: '시작 시각을 30분 단위 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '시간 이용은 시작 시각을 입력해주세요.'})
    start_time?: string;

    /** 박수 (1 ~ 180 — 업체 설정 최소 ~ 최대 박수) — 연박이면 필수, 그 밖은 무시 */
    @ValidateIf((dto: ReservationDto) => dto.room_plan_type_id === 'LONG')
    @IsInt({message: '박수는 정수로 입력해주세요.'})
    @Min(1, {message: '박수는 1 ~ 180박 사이로 입력해주세요.'})
    @Max(180, {message: '박수는 1 ~ 180박 사이로 입력해주세요.'})
    @IsNotEmpty({message: '연박은 박수를 입력해주세요.'})
    nights?: number;
}

/**
 * 예약 생성 결과 — 프론트는 payment_id 를 토스 orderId, amount · order_name 으로 결제창을 연다(결제 대기 만료 전까지)
 */
export class ReservationResultDto {
    /** 예약 ID */
    reservation_id: string;

    /** 결제 ID — 토스 orderId */
    payment_id: string;

    /** 주문명 — 토스 orderName */
    order_name: string;

    /** 결제 금액(원) — 토스 amount */
    amount: number;

    /** 결제 대기 만료 일시 (ISO 8601 — 이때까지 결제가 확인되지 않으면 만료) */
    expires_at: string;

    /** 입실 일시 (ISO 8601) */
    start_at: string;

    /** 퇴실 일시 (ISO 8601) */
    end_at: string;
}
```
