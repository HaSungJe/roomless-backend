import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Max, MaxLength, Min, ValidateNested} from 'class-validator';

/**
 * 객실 그룹 등록의 상세정보 — 보낸 알려진 항목만 받고, 빠진 항목은 service 가 지금 기본값으로 채워 전부 저장한다. 선언하지 않은 항목은 버린다
 */
export class RoomGroupDetailInputDto {
    @ApiProperty({description: '객실 안의 방 개수 (1 ~ 20 — 원룸 1 · 투룸 2)', required: false})
    @IsOptional()
    @IsInt({message: '방 개수는 정수로 입력해주세요.'})
    @Min(1, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    @Max(20, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    room_count?: number;

    @ApiProperty({description: '샤워실 유무 (0: 없음, 1: 있음)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: '샤워실 유무가 올바르지 않습니다.'})
    has_shower?: number;

    @ApiProperty({description: 'TV 유무 (0: 없음, 1: 있음)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'TV 유무가 올바르지 않습니다.'})
    has_tv?: number;

    @ApiProperty({description: 'PC 유무 (0: 없음, 1: 있음)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'PC 유무가 올바르지 않습니다.'})
    has_pc?: number;
}

/**
 * 객실 그룹 등록 — 그룹 상품 3개(사용 안 함 · 요금 0)를 함께 만든다. 업체 안 지워지지 않은 그룹명이 같으면 400. 설명은 비우면 null
 */
export class RoomGroupDto {
    @ApiProperty({description: '그룹명 (100자 — 업체 안에서 유일)'})
    @MaxLength(100, {message: '그룹명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '그룹명을 입력해주세요.'})
    room_group_name: string;

    @ApiProperty({description: '설명 (2,000자) — 비우면 null', required: false})
    @IsOptional()
    @MaxLength(2000, {message: '설명은 2,000자 이내로 입력해주세요.'})
    description?: string;

    @ApiProperty({description: '상세정보 — 빠진 항목은 기본값(방 1 · 샤워실 · TV · PC 있음)으로 채워 저장한다, 안 보내면 모두 기본값', required: false, type: () => RoomGroupDetailInputDto})
    @IsOptional()
    @Type(() => RoomGroupDetailInputDto)
    @ValidateNested({message: '상세정보 형식이 올바르지 않습니다.'})
    room_group_detail?: RoomGroupDetailInputDto;
}

/**
 * 객실 그룹 등록 결과
 */
export class RoomGroupResultDto {
    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;
}
