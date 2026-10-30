import {ApiProperty} from '@nestjs/swagger';
import {IsOptional, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 호실 목록 query — 층 · 객실 그룹 필터. 지워지지 않은 호실만, 층 · 호실명 순
 */
export class RoomListDto extends PaginationDto {
    @ApiProperty({description: '층 (정수 — 지하는 음수, B1 = -1) — 없으면 전체', required: false})
    @IsOptional()
    @Matches(/^-?\d{1,3}$/, {message: '층을 정수로 입력해주세요.'})
    floor: string | null;

    @ApiProperty({description: '객실 그룹 ID — 없으면 전체', required: false})
    @IsOptional()
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    room_group_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<RoomListDto>) {
        super(data);
        this.floor = data?.floor ?? null;
        this.room_group_id = data?.room_group_id ?? null;
    }
}

/**
 * 호실 목록 항목
 */
export class RoomListItemResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '그룹명'})
    room_group_name: string;

    @ApiProperty({description: '호실명 (예: 101호)'})
    room_name: string;

    @ApiProperty({description: '층 (지하는 음수, B1 = -1)'})
    floor: number;

    @ApiProperty({description: '호실 상태 (AVAILABLE: 예약가능, RESERVED: 예약완료, IN_USE: 사용중, MAINTENANCE: 정비중, DISABLED: 사용중지)'})
    room_state_id: string;

    @ApiProperty({description: '호실 상태명'})
    room_state_name: string;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 호실 목록
 */
export class RoomListResultDto {
    @ApiProperty({description: '목록 (층 · 호실명 순)', type: () => [RoomListItemResultDto]})
    list: RoomListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
