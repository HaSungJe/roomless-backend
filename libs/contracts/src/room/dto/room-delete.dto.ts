import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 삭제 path param — 내 업체의 지워지지 않은 호실만(아니면 404)
 */
export class RoomDeleteParamDto {
    @ApiProperty({description: '호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}
