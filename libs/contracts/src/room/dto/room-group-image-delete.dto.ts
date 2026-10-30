import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 사진 삭제 path param — 내 업체 그룹의 지워지지 않은 사진만(아니면 404)
 */
export class RoomGroupImageDeleteParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    @ApiProperty({description: '객실 그룹 사진 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '사진 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '사진 ID를 입력해주세요.'})
    room_group_image_id: string;
}
