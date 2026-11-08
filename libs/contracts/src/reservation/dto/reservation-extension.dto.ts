import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 연장 조회 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationExtensionParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 연장 조회 — 지금 끝에서 한 단위(시간 이용 · 1박: 업체 이용 시간, 연박: 1일) 늘리면 몇 시까지 · 얼마인지, 못 하면 사유. 잡아 두지 않는다
 */
export class ReservationExtensionResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '연장할 수 있는지 (0 · 1)'})
    is_extendable: number;

    @ApiProperty({description: '연장할 수 없는 사유 — 할 수 있으면 null', nullable: true, type: String})
    reason: string | null;

    @ApiProperty({description: '요금 상품 (HOURLY: 시간 이용 요금 — 시간 이용 · 1박, NIGHT: 1박 요금 — 연박) — 계산할 수 없으면 null', nullable: true, type: String})
    room_plan_type_id: string | null;

    @ApiProperty({description: '연장 시작 일시 (ISO 8601 — 지금 끝) — 계산할 수 없으면 null', nullable: true, type: String})
    start_at: string | null;

    @ApiProperty({description: '연장 뒤 끝 일시 (ISO 8601) — 계산할 수 없으면 null', nullable: true, type: String})
    end_at: string | null;

    @ApiProperty({description: '연장 금액(원) — 계산할 수 없으면 null', nullable: true, type: Number})
    amount: number | null;
}
