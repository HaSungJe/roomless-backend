import { ApiProperty } from "@nestjs/swagger";
import { IsOptional } from "class-validator";

/**
 * 페이지탭에 표시될 페이지목록의 범위
 */
class PageRangeResultDto {
    @ApiProperty({description: '시작값', required: true})
    start: number;

    @ApiProperty({description: '종료값', required: true})
    end: number;
}

/**
 * 페이지 정보
 */
export class PaginationResultDto {
    @ApiProperty({description: '전체검색 여부(Y/N)', required: true})
    all_search_yn: string;

    @ApiProperty({description: '총 개수', required: true})
    total_count: number;

    @ApiProperty({description: '현재 페이지', required: true})
    page: number;

    @ApiProperty({description: '최대 페이지', required: true})
    max_page: number;

    @ApiProperty({description: '페이지탭에 표시될 페이지목록의 범위', type: () => PageRangeResultDto, required: true})
    page_range: PageRangeResultDto;

    @ApiProperty({description: '컨텐츠에 표시할 번호 시작값', required: true})
    content_start_number: number;

    @ApiProperty({description: '컨텐츠에 표시할 번호 시작값 (역순)', required: true})
    content_start_number_reverse: number;
}

/**
 * 페이지정보 Dto
 *
 * Query DTO 규약 — 생성자가 기본값의 단일 소재지다.
 * 파라미터는 반드시 선택(`data?`): ValidationPipe 가 내부적으로 `new PaginationDto()` 를 인자 없이 호출하므로
 * 필수로 두면 매 요청 500 이 난다. 기본값은 Pagination 유틸(common/utils/pagination.ts)과 동일하게 맞춘다.
 */
export class PaginationDto {
    @ApiProperty({ description: '전체검색 여부(Y/N). Y 가 아니면 모두 N 으로 처리. 기본값: N', required: false })
    @IsOptional()
    all_search_yn: string;

    @ApiProperty({description: '페이지. 기본값: 1', required: false})
    @IsOptional()
    page: number;

    @ApiProperty({description: '페이지당 출력될 데이터 수. 기본값: 20', required: false})
    @IsOptional()
    size: number;

    @ApiProperty({description: '페이지탭에 출력될 페이지의 수. 기본값: 10', required: false})
    @IsOptional()
    page_size: number;

    constructor(data?: Partial<PaginationDto>) {
        this.all_search_yn = data?.all_search_yn ?? 'N';
        this.page = data?.page ?? 1;
        this.size = data?.size ?? 20;
        this.page_size = data?.page_size ?? 10;
    }
}