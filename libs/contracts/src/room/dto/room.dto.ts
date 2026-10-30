import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 호실 등록 — 내 업체의 지워지지 않은 그룹에(없으면 404), 상태는 예약가능. 업체 안 지워지지 않은 호실명이 같으면 400
 */
export class RoomDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

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

/**
 * 호실 등록 결과
 */
export class RoomResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;
}
