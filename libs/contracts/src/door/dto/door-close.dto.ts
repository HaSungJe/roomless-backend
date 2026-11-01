import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 문 닫기 — 권한 없이 그 호실 문을 닫힘 + 지금 시각으로 바꾼다. 지워지지 않은 호실이 없으면 404
 */
export class DoorCloseDto {
    @ApiProperty({description: '호실 ID (문 열기 결과의 room_id)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}
