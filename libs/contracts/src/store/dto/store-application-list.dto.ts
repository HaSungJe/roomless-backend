import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 입점 신청 목록 query (총관리자) — 상태 · 검색어(상호명 · 사업자등록번호 부분 일치)
 */
export class StoreApplicationListDto extends PaginationDto {
    @ApiProperty({description: '신청 상태 (WAIT · APPROVED · REJECTED) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['WAIT', 'APPROVED', 'REJECTED'], {message: '신청 상태가 올바르지 않습니다.'})
    store_application_state_id: string | null;

    @ApiProperty({description: '검색어 — 상호명 · 사업자등록번호 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<StoreApplicationListDto>) {
        super(data);
        this.store_application_state_id = data?.store_application_state_id ?? null;
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 입점 신청 목록 항목 (총관리자)
 */
export class StoreApplicationListItemResultDto {
    @ApiProperty({description: '입점 신청 ID'})
    store_application_id: string;

    @ApiProperty({description: '신청한 이용자 ID'})
    user_id: string;

    @ApiProperty({description: '신청 상태 (WAIT · APPROVED · REJECTED)'})
    store_application_state_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '승인으로 만든 업체 ID (승인 전 null)', nullable: true, type: String})
    store_id: string | null;

    @ApiProperty({description: '처리일시 (ISO 8601)', nullable: true, type: String})
    reviewed_at: string | null;

    @ApiProperty({description: '신청일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 입점 신청 목록 (총관리자)
 */
export class StoreApplicationListResultDto {
    @ApiProperty({description: '목록 (신청일 최신순)', type: () => [StoreApplicationListItemResultDto]})
    list: StoreApplicationListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
