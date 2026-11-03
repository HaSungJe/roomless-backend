import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 예약 현황 query — 날짜(한국 날짜) 하루와 겹치는 예약을 호실별로
 */
export class ReservationStoreDto {
    @ApiProperty({description: '날짜 (YYYY-MM-DD, 한국 날짜)'})
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
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '예약 상태 (PENDING · CONFIRMED · CHECKED_IN · COMPLETED)'})
    reservation_state_id: string;

    @ApiProperty({description: '예약 상태명'})
    reservation_state_name: string;

    @ApiProperty({description: '상품 종류 (HOURLY · NIGHT · LONG)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '입실 일시 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '퇴실 일시 (ISO 8601)'})
    end_at: string;

    @ApiProperty({description: '점유 끝 (ISO 8601 — 퇴실 + 정비시간)'})
    blocked_until: string;

    @ApiProperty({description: '합계 금액(원)'})
    total_price: number;

    @ApiProperty({description: '이용자 이름'})
    user_name: string;

    @ApiProperty({description: '이용자 휴대폰 번호 — 인증 전이면 null', nullable: true, type: String})
    user_phone: string | null;
}

/**
 * 호실 1개와 그날 예약
 */
export class ReservationStoreRoomResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '층'})
    floor: number;

    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '호실 상태 (AVAILABLE · RESERVED · IN_USE · MAINTENANCE · DISABLED)'})
    room_state_id: string;

    @ApiProperty({description: '호실 상태명'})
    room_state_name: string;

    @ApiProperty({description: '그날 예약 (입실 순)', type: () => [ReservationStoreItemResultDto]})
    reservations: ReservationStoreItemResultDto[];
}

/**
 * 내 업체 예약 현황
 */
export class ReservationStoreResultDto {
    @ApiProperty({description: '날짜 (YYYY-MM-DD)'})
    date: string;

    @ApiProperty({description: '호실 목록 (층 · 호실명 순 — 지워지지 않은 호실)', type: () => [ReservationStoreRoomResultDto]})
    list: ReservationStoreRoomResultDto[];
}
