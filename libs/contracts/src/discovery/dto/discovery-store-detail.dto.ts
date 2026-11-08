import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 상세 path param
 */
export class DiscoveryStoreDetailParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 사진 1장
 */
export class DiscoveryStoreImageResultDto {
    @ApiProperty({description: '사진 주소 (CloudFront)'})
    image_url: string;

    @ApiProperty({description: '정렬 순서 (0 부터)'})
    sort_order: number;
}

/**
 * 요일 영업시간 1개
 */
export class DiscoveryStoreHourResultDto {
    @ApiProperty({description: '요일 (0: 일 ~ 6: 토)'})
    day_of_week: number;

    @ApiProperty({description: '휴무 여부 (0: 영업, 1: 휴무 — 시각 null)'})
    is_closed: number;

    @ApiProperty({description: '여는 시각 (HH:mm, 한국 시각) — 휴무면 null', nullable: true, type: String})
    open_time: string | null;

    @ApiProperty({description: '닫는 시각 (HH:mm — 여는 시각보다 이르면 다음 날) — 휴무면 null', nullable: true, type: String})
    close_time: string | null;
}

/**
 * 브레이크타임 1개 (매일)
 */
export class DiscoveryStoreBreakResultDto {
    @ApiProperty({description: '시작 시각 (HH:mm)'})
    start_time: string;

    @ApiProperty({description: '끝 시각 (HH:mm)'})
    end_time: string;
}

/**
 * 판매 중인 상품 설정 1개
 */
export class DiscoveryStorePlanResultDto {
    @ApiProperty({description: '상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '예약 가능 요일 (비트 — 일 1 · 월 2 · … · 토 64, 매일 127, 1박 · 연박은 입실일 기준)'})
    days_of_week: number;

    @ApiProperty({description: '이용 시간(시간) — 시간 이용만, 그 밖은 null', nullable: true, type: Number})
    usage_hours: number | null;

    @ApiProperty({description: '입실 시각 (HH:mm) — 1박 · 연박만, 그 밖은 null', nullable: true, type: String})
    check_in_time: string | null;

    @ApiProperty({description: '퇴실 시각 (HH:mm — 다음 날 이후) — 1박 · 연박만, 그 밖은 null', nullable: true, type: String})
    check_out_time: string | null;

    @ApiProperty({description: '최소 박수 — 연박만, 그 밖은 null', nullable: true, type: Number})
    min_nights: number | null;

    @ApiProperty({description: '최대 박수 — 연박만, 그 밖은 null', nullable: true, type: Number})
    max_nights: number | null;

    @ApiProperty({description: '이용 중에 연장할 수 있는지 (0 · 1)'})
    is_extendable: number;

    @ApiProperty({description: '최대 연장 횟수 (1 ~ 10)'})
    max_extensions: number;
}

/**
 * 업체 상세 — 이용자 공개용(사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 여부 · 사업자등록증은 넣지 않는다)
 */
export class DiscoveryStoreDetailResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '업체 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '상세주소', nullable: true, type: String})
    address_detail: string | null;

    @ApiProperty({description: '위도 (WGS84)'})
    latitude: number;

    @ApiProperty({description: '경도 (WGS84)'})
    longitude: number;

    @ApiProperty({description: '업체 소개', nullable: true, type: String})
    introduction: string | null;

    @ApiProperty({description: '영업중 여부 (0: 지금 영업하지 않음 — 예약 불가, 1: 영업중)'})
    is_open: number;

    @ApiProperty({description: '24시간 연중무휴 여부 (0: 요일별 영업시간, 1: 24시간 — hours 는 참고용)'})
    is_always_open: number;

    @ApiProperty({description: '예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약을 받는다'})
    booking_open_hours: number;

    @ApiProperty({description: '100% 환불 마감(분) — 이용 시작 n분 전까지 취소하면 전액 환불'})
    refund_deadline_minutes: number;

    @ApiProperty({description: '마감 뒤 환불 비율(%) — 마감 뒤 ~ 이용 시작 전 취소'})
    late_refund_percent: number;

    @ApiProperty({description: '업체 사진 (정렬 순서)', type: () => [DiscoveryStoreImageResultDto]})
    images: DiscoveryStoreImageResultDto[];

    @ApiProperty({description: '요일별 영업시간 (일 ~ 토)', type: () => [DiscoveryStoreHourResultDto]})
    hours: DiscoveryStoreHourResultDto[];

    @ApiProperty({description: '브레이크타임 (시작 순, 매일)', type: () => [DiscoveryStoreBreakResultDto]})
    breaks: DiscoveryStoreBreakResultDto[];

    @ApiProperty({description: '판매 중인 상품 설정 (시간 이용 → 1박 → 연박)', type: () => [DiscoveryStorePlanResultDto]})
    plans: DiscoveryStorePlanResultDto[];
}
