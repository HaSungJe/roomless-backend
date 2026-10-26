import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty} from 'class-validator';

/**
 * 내 업체 영업중 여부 변경 — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님
 */
export class StoreMineOpenDto {
    @ApiProperty({description: '영업중 여부 (0: 영업중 아님, 1: 영업중)', enum: [0, 1]})
    @IsIn([0, 1], {message: '영업중 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '영업중 여부를 입력해주세요.'})
    is_open: number;
}
