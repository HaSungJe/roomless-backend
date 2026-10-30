import {ApiProperty} from '@nestjs/swagger';
import {IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 객실 그룹 목록 query — 검색어(그룹명 부분 일치). 지워지지 않은 그룹만, 등록일 최신순
 */
export class RoomGroupListDto extends PaginationDto {
    @ApiProperty({description: '검색어 — 그룹명 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 검색어는 null
     */
    constructor(data?: Partial<RoomGroupListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 객실 그룹 목록 항목
 */
export class RoomGroupListItemResultDto {
    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '그룹명'})
    room_group_name: string;

    @ApiProperty({description: '호실 수 (지워지지 않은 호실)'})
    room_count: number;

    @ApiProperty({description: '대표 사진 열람 주소 (CDN — 순서가 가장 앞인 사진) — 사진이 없으면 null', nullable: true, type: String})
    image_url: string | null;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 객실 그룹 목록
 */
export class RoomGroupListResultDto {
    @ApiProperty({description: '목록 (등록일 최신순)', type: () => [RoomGroupListItemResultDto]})
    list: RoomGroupListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
