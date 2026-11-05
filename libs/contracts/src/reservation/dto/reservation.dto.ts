import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, Min, ValidateIf} from 'class-validator';

/**
 * 예약 생성 — 호실 · 상품 · 날짜(한국 날짜). 시간 이용은 시작 시각(30분 단위) 또는 지금 바로(is_now 1 — 오늘만), 연박은 박수가 필수다. 금액은 서버가 계산한다
 */
export class ReservationDto {
    @ApiProperty({description: '호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;

    @ApiProperty({description: '상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    @ApiProperty({description: '날짜 (YYYY-MM-DD, 한국 날짜 — 시간 이용은 시작일, 1박 · 연박은 입실일)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    @ApiProperty({
        description: '지금 바로 이용 (1: 지금(분 단위 내림)부터 이용 시간만큼 — 시간 이용 · 오늘 날짜만, 시작 시각은 보내지 않는다 / 0 또는 생략: 시작 시각대로)',
        required: false,
        enum: [0, 1],
    })
    @IsOptional()
    @IsIn([0, 1], {message: '지금 바로 이용 여부가 올바르지 않습니다.'})
    is_now?: number;

    @ApiProperty({description: '시작 시각 (HH:mm — 00분 · 30분, 한국 시각) — 시간 이용이면 필수(지금 바로는 빼고), 그 밖은 무시', required: false})
    @ValidateIf((dto: ReservationDto) => dto.room_plan_type_id === 'HOURLY' && dto.is_now !== 1)
    @Matches(/^([01]\d|2[0-3]):(00|30)$/, {message: '시작 시각을 30분 단위 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '시간 이용은 시작 시각을 입력해주세요.'})
    start_time?: string;

    @ApiProperty({description: '박수 (1 ~ 180 — 업체 설정 최소 ~ 최대 박수) — 연박이면 필수, 그 밖은 무시', required: false})
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
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '결제 ID — 토스 orderId'})
    payment_id: string;

    @ApiProperty({description: '주문명 — 토스 orderName'})
    order_name: string;

    @ApiProperty({description: '결제 금액(원) — 토스 amount'})
    amount: number;

    @ApiProperty({description: '결제 대기 만료 일시 (ISO 8601 — 이때까지 결제가 확인되지 않으면 만료)'})
    expires_at: string;

    @ApiProperty({description: '입실 일시 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '퇴실 일시 (ISO 8601)'})
    end_at: string;
}
