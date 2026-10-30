import {ApiProperty} from '@nestjs/swagger';

/**
 * 업체 상품 설정 1개 — 업체 × 상품 종류. 이용 시간은 시간 이용만, 입실 · 퇴실 시각은 1박 · 연박만 값이 있다
 */
export class RoomPlanItemResultDto {
    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '사용 여부 (0: 팔지 않음, 1: 판매)'})
    is_used: number;

    @ApiProperty({description: '예약 가능 요일 (비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127)'})
    days_of_week: number;

    @ApiProperty({description: '이용 시간(시간) — 시간 이용만, 1박 · 연박은 null', nullable: true, type: Number})
    usage_hours: number | null;

    @ApiProperty({description: '입실 시각 (HH:mm, 한국 시각) — 1박 · 연박(첫날)만, 시간 이용은 null', nullable: true, type: String})
    check_in_time: string | null;

    @ApiProperty({description: '퇴실 시각 (HH:mm, 한국 시각 — 1박은 입실보다 이르면 다음 날, 연박은 마지막 날) — 시간 이용은 null', nullable: true, type: String})
    check_out_time: string | null;
}

/**
 * 업체 상품 설정 목록 — 상품 종류마다 1개(3개)
 */
export class RoomPlanListResultDto {
    @ApiProperty({description: '목록 (HOURLY · NIGHT · LONG 순)', type: () => [RoomPlanItemResultDto]})
    list: RoomPlanItemResultDto[];
}
