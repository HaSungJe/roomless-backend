import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, MaxLength } from 'class-validator';
import { PaginationDto, PaginationResultDto } from '@root/common/dto/pagination.dto';

/**
 * 가맹점 목록 조회 입력 — 검색조건 + 페이지 정보(PaginationDto 상속).
 * 생성자 파라미터는 선택(`data?`) — ValidationPipe 가 인자 없이 new 하기 때문.
 * 부모 필드(all_search_yn/page/size/page_size)를 재선언하면 useDefineForClassFields 로 기본값이 덮이므로 재선언하지 않는다.
 */
export class StoreListDto extends PaginationDto {
    @ApiProperty({description: '검색 대상 (ALL: 전체, STORE_NAME: 상호명, BUSINESS_NUMBER: 사업자등록번호, OWNER_NAME: 대표자명)', required: false})
    @IsOptional()
    @IsIn(['ALL', 'STORE_NAME', 'BUSINESS_NUMBER', 'OWNER_NAME'], {message: '검색 대상이 올바르지 않습니다.'})
    search_type: string | null;

    @ApiProperty({description: '검색어 (최대 100자)', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 최대 100자까지 입력할 수 있습니다.'})
    search_keyword: string | null;

    constructor(data?: Partial<StoreListDto>) {
        super(data);
        this.search_type = data?.search_type ?? null;
        this.search_keyword = data?.search_keyword ?? null;
    }
}

/**
 * 가맹점 목록 항목
 */
export class StoreListItemDto {
    @ApiProperty({description: '가맹점 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '가맹점 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '상세주소 (없으면 null)'})
    address_detail: string | null;

    @ApiProperty({description: '등록일'})
    create_at: Date;

    @ApiProperty({description: '수정일'})
    update_at: Date;
}

/**
 * 가맹점 목록 조회 응답
 */
export class StoreListResultDto {
    @ApiProperty({description: '가맹점 목록', isArray: true, type: () => StoreListItemDto})
    list: Array<StoreListItemDto>;

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
