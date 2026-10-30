import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, Min} from 'class-validator';

/**
 * 업체 상품 설정 수정 path param — 상품 종류
 */
export class RoomPlanUpdateParamDto {
    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 업체 상품 설정 수정 — 종류별. 시간 이용(HOURLY)은 이용 시간 필수 · 시각은 받지 않고, 1박 · 연박은 입실 · 퇴실 시각 필수(서로 달라야 한다) · 이용 시간은 받지 않는다.
 * 종류가 경로라 종류별 값은 선택 필드로 두고 service 가 종류로 가른다(없으면 400 — validation_errors 에 그 필드)
 */
export class RoomPlanUpdateDto {
    @ApiProperty({description: '사용 여부 (0: 팔지 않음, 1: 판매)', enum: [0, 1]})
    @IsIn([0, 1], {message: '사용 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '사용 여부를 입력해주세요.'})
    is_used: number;

    @ApiProperty({description: '예약 가능 요일 (비트 합 1 ~ 127 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127. 팔지 않으려면 is_used 0)'})
    @IsInt({message: '예약 가능 요일은 정수로 입력해주세요.'})
    @Min(1, {message: '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'})
    @Max(127, {message: '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'})
    @IsNotEmpty({message: '예약 가능 요일을 입력해주세요.'})
    days_of_week: number;

    @ApiProperty({description: '이용 시간(시간, 1 ~ 24) — 시간 이용(HOURLY)이면 필수, 1박 · 연박은 받지 않는다', required: false})
    @IsOptional()
    @IsInt({message: '이용 시간은 시간 단위 정수로 입력해주세요.'})
    @Min(1, {message: '이용 시간은 1 ~ 24시간 사이로 입력해주세요.'})
    @Max(24, {message: '이용 시간은 1 ~ 24시간 사이로 입력해주세요.'})
    usage_hours?: number;

    @ApiProperty({description: '입실 시각 (HH:mm, 한국 시각) — 1박 · 연박이면 퇴실 시각과 세트로 필수, 시간 이용은 받지 않는다', required: false})
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '입실 시각을 HH:mm 으로 입력해주세요.'})
    check_in_time?: string;

    @ApiProperty({description: '퇴실 시각 (HH:mm, 한국 시각 — 1박은 입실보다 이르면 다음 날) — 1박 · 연박이면 입실 시각과 세트로 필수(입실과 달라야 한다), 시간 이용은 받지 않는다', required: false})
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '퇴실 시각을 HH:mm 으로 입력해주세요.'})
    check_out_time?: string;
}
