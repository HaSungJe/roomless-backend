import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 삭제 path param — 내 업체의 지워지지 않은 그룹만(아니면 404). 그 그룹의 호실 · 사진도 함께 지운다
 */
export class RoomGroupDeleteParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}
