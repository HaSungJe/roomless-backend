import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {ArrayMaxSize, IsArray, IsNotEmpty, Matches, ValidateNested} from 'class-validator';

/**
 * 브레이크타임 1개 — 매일 같은 시각. 마감이 시작보다 이르면 다음 날까지(23:00 ~ 02:00)
 */
export class StoreMineBreakDto {
    @ApiProperty({description: '브레이크 시작 시각 (HH:mm, 한국 시각)'})
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '브레이크 시작 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '브레이크 시작 시각을 입력해주세요.'})
    start_time: string;

    @ApiProperty({description: '브레이크 마감 시각 (HH:mm — 시작보다 이르면 다음 날)'})
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '브레이크 마감 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '브레이크 마감 시각을 입력해주세요.'})
    end_time: string;
}

/**
 * 내 업체 브레이크타임 설정 — 통째로 교체(빈 배열이면 모두 지운다). 서로 겹치면 안 된다(끝점이 맞닿는 것은 된다)
 */
export class StoreMineBreaksDto {
    @ApiProperty({description: '브레이크타임 (매일 · 10개까지 · 서로 겹치면 400)', type: () => [StoreMineBreakDto]})
    @Type(() => StoreMineBreakDto)
    @ValidateNested({each: true, message: '브레이크타임 형식이 올바르지 않습니다.'})
    @ArrayMaxSize(10, {message: '브레이크타임은 10개까지 입력할 수 있습니다.'})
    @IsArray({message: '브레이크타임을 배열로 입력해주세요.'})
    @IsNotEmpty({message: '브레이크타임을 입력해주세요.'})
    breaks: StoreMineBreakDto[];
}
