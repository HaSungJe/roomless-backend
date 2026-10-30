import {ApiProperty} from '@nestjs/swagger';
import {ArrayMaxSize, IsArray, IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 사진 순서 변경 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupImageOrderParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 사진 순서 변경 — 지금 그룹 사진 ID 전부를 원하는 순서로(가장 앞이 대표)
 */
export class RoomGroupImageOrderDto {
    @ApiProperty({description: '그룹 사진 ID 전부를 원하는 순서로 — 빠지거나 남거나 겹치면 400', type: [String]})
    @Matches(/^[a-f0-9]{32}$/, {each: true, message: '사진 ID가 올바르지 않습니다.'})
    @ArrayMaxSize(5, {message: '객실 그룹 사진은 5장까지입니다.'})
    @IsArray({message: '사진 ID를 배열로 입력해주세요.'})
    @IsNotEmpty({message: '사진 ID를 입력해주세요.'})
    room_group_image_ids: string[];
}
