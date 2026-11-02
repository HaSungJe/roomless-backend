import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 호실 수정 path param — 내 업체의 지워지지 않은 호실만(아니면 404)
 */
export class RoomUpdateParamDto {
    @ApiProperty({description: '호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 호실 수정 — 호실명 · 층을 통째로. 그룹은 등록 때만 정한다(바꾸지 않는다 — 잘못 등록했으면 지우고 다시 등록). 업체 안 지워지지 않은 호실명이 같으면 400
 */
export class RoomUpdateDto {
    @ApiProperty({description: '호실명 (50자 — 예: 101호, 업체 안에서 유일)'})
    @MaxLength(50, {message: '호실명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '호실명을 입력해주세요.'})
    room_name: string;

    @ApiProperty({description: '층 (-10 ~ 200 정수 — 지하는 음수, B1 = -1)'})
    @IsInt({message: '층은 정수로 입력해주세요.'})
    @Min(-10, {message: '층은 -10 ~ 200 사이로 입력해주세요.'})
    @Max(200, {message: '층은 -10 ~ 200 사이로 입력해주세요.'})
    @IsNotEmpty({message: '층을 입력해주세요.'})
    floor: number;
}
