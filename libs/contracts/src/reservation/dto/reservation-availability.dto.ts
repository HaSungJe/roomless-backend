import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches, ValidateIf} from 'class-validator';

/**
 * 호실별 예약 가능 시간 query — 업체 · 날짜(한국 날짜) · 상품. 연박은 박수가 필수다. 쿼리 값은 문자열이다.
 */
export class ReservationAvailabilityDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;

    @ApiProperty({description: '날짜 (YYYY-MM-DD, 한국 날짜 — 시간 이용은 시작일, 1박 · 연박은 입실일)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    @ApiProperty({description: '상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    @ApiProperty({description: '박수 — 연박(LONG)이면 필수(업체 설정 최소 ~ 최대 박수), 그 밖은 무시', required: false})
    @ValidateIf((dto: ReservationAvailabilityDto) => dto.room_plan_type_id === 'LONG')
    @Matches(/^\d{1,3}$/, {message: '박수를 숫자로 입력해주세요.'})
    @IsNotEmpty({message: '연박은 박수를 입력해주세요.'})
    nights: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 값은 빈 문자열(검증에서 걸린다), 박수는 null
     */
    constructor(data?: Partial<ReservationAvailabilityDto>) {
        this.store_id = data?.store_id ?? '';
        this.date = data?.date ?? '';
        this.room_plan_type_id = data?.room_plan_type_id ?? '';
        this.nights = data?.nights ?? null;
    }
}

/**
 * 예약 가능 구간 1개
 */
export class ReservationAvailabilitySlotResultDto {
    @ApiProperty({description: '시작(입실) 일시 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '끝(퇴실) 일시 (ISO 8601)'})
    end_at: string;
}

/**
 * 호실 1개 — 이 상품을 파는 호실(그룹 상품 판매 · 요금 > 0)만 나온다. 예약할 수 있는 구간이 없으면 slots 가 빈 배열이다
 */
export class ReservationAvailabilityRoomResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '층 (지하는 음수)'})
    floor: number;

    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '금액(원) — 시간 이용 1회 · 1박 · 연박 박수 합계(기간 가격 반영)'})
    price: number;

    @ApiProperty({description: '예약 가능 구간 (시작 순 — 시간 이용은 30분 단위)', type: () => [ReservationAvailabilitySlotResultDto]})
    slots: ReservationAvailabilitySlotResultDto[];
}

/**
 * 호실별 예약 가능 시간
 */
export class ReservationAvailabilityResultDto {
    @ApiProperty({description: '상품 종류'})
    room_plan_type_id: string;

    @ApiProperty({description: '날짜 (YYYY-MM-DD)'})
    date: string;

    @ApiProperty({description: '박수 — 연박만, 그 밖은 null', nullable: true, type: Number})
    nights: number | null;

    @ApiProperty({description: '호실 목록 (층 · 호실명 순)', type: () => [ReservationAvailabilityRoomResultDto]})
    list: ReservationAvailabilityRoomResultDto[];
}
