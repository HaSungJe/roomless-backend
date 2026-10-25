import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 업체 목록 query (총관리자) — 상태 · 검색어(상호명 · 사업자등록번호 · 대표자명 부분 일치)
 */
export class StoreListDto extends PaginationDto {
    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['ACTIVE', 'SUSPEND', 'LEAVE'], {message: '업체 상태가 올바르지 않습니다.'})
    store_state_id: string | null;

    @ApiProperty({description: '검색어 — 상호명 · 사업자등록번호 · 대표자명 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<StoreListDto>) {
        super(data);
        this.store_state_id = data?.store_state_id ?? null;
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 업체 목록 항목
 */
export class StoreListItemResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE)'})
    store_state_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호 (탈퇴 업체는 DELETE_<store_id>)'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '업체 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '영업중 여부 (0: 영업중 아님 · 영업준비, 1: 영업중)'})
    is_open: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 업체 목록
 */
export class StoreListResultDto {
    @ApiProperty({description: '목록 (등록일 최신순)', type: () => [StoreListItemResultDto]})
    list: StoreListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
