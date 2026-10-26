import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {ArrayMaxSize, IsArray, IsIn, IsNotEmpty, Matches, ValidateIf, ValidateNested} from 'class-validator';

/**
 * 요일 영업시간 1개 — 휴무가 아니면 시작 · 마감 시각이 세트로 필수(t_store_hour CHK_StoreHour_OpenCloseTime). 휴무면 보낸 시각은 버린다
 */
export class StoreMineHourDto {
    @ApiProperty({description: '요일 (0: 일 ~ 6: 토)', enum: [0, 1, 2, 3, 4, 5, 6]})
    @IsIn([0, 1, 2, 3, 4, 5, 6], {message: '요일이 올바르지 않습니다.'})
    @IsNotEmpty({message: '요일을 입력해주세요.'})
    day_of_week: number;

    @ApiProperty({description: '휴무 여부 (0: 영업, 1: 휴무)', enum: [0, 1]})
    @IsIn([0, 1], {message: '휴무 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '휴무 여부를 입력해주세요.'})
    is_closed: number;

    // open_time / close_time 한 세트: 휴무가 아니면 둘 다 받는다. 휴무면 검증하지 않는다(service 가 NULL 로 저장)
    @ApiProperty({description: '영업 시작 시각 (HH:mm, 한국 시각) — 휴무가 아니면 close_time 과 세트로 필수', required: false})
    @ValidateIf((o) => o.is_closed !== 1)
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '영업 시작 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '휴무가 아니면 영업 시작 시각을 입력해주세요.'})
    open_time?: string;

    @ApiProperty({description: '영업 마감 시각 (HH:mm — 시작보다 이르면 다음 날 마감) — 휴무가 아니면 open_time 과 세트로 필수', required: false})
    @ValidateIf((o) => o.is_closed !== 1)
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '영업 마감 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '휴무가 아니면 영업 마감 시각을 입력해주세요.'})
    close_time?: string;
}

/**
 * 내 업체 영업시간 설정 — 통째로 교체. 연중무휴 1 이면 요일별 영업시간을 비우고, 0 이면 일 ~ 토 7개를 한 번씩 보낸다
 */
export class StoreMineHoursDto {
    @ApiProperty({description: '24시간 연중무휴 여부 (0: 요일별 영업시간, 1: 24시간 연중무휴)', enum: [0, 1]})
    @IsIn([0, 1], {message: '연중무휴 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '연중무휴 여부를 입력해주세요.'})
    is_always_open: number;

    @ApiProperty({description: '요일별 영업시간 — 연중무휴 0 이면 일 ~ 토 7개, 1 이면 빈 배열', type: () => [StoreMineHourDto]})
    @Type(() => StoreMineHourDto)
    @ValidateNested({each: true, message: '요일별 영업시간 형식이 올바르지 않습니다.'})
    @ArrayMaxSize(7, {message: '요일별 영업시간은 7개까지 입력할 수 있습니다.'})
    @IsArray({message: '요일별 영업시간을 배열로 입력해주세요.'})
    @IsNotEmpty({message: '요일별 영업시간을 입력해주세요.'})
    hours: StoreMineHourDto[];
}
