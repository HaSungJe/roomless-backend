import {ApiProperty} from '@nestjs/swagger';
import {IsOptional} from 'class-validator';

/** 페이지 기본값 — PaginationDto 생성자(사양)와 Pagination 의 폴백(안전망)이 같이 쓴다 */
export const PAGINATION_DEFAULTS = {all_search_yn: 'N', page: 1, size: 20, page_size: 10} as const;

/**
 * 목록 Query DTO 의 부모 — 페이지 기본값은 이 생성자가 정한다.
 * - 기능별 Query DTO 는 `extends PaginationDto` 후 `super(data)` 를 부르고 자기 필드만 더한다(부모 필드 재선언 ❌ — useDefineForClassFields 로 부모 기본값이 undefined 로 덮인다).
 * - 생성자 파라미터는 반드시 선택이다. ValidationPipe(transform) 가 `new PaginationDto()` 를 인자 없이 부른다.
 * - 쿼리 값은 문자열로 들어온다(`'2'`). 직접 산술하지 말고 `Pagination` 에 넘긴다.
 */
export class PaginationDto {
    @ApiProperty({description: '전체 조회 여부(Y/N) — Y 가 아니면 N. 기본값 N', required: false})
    @IsOptional()
    all_search_yn: string;

    @ApiProperty({description: '페이지. 기본값 1', required: false})
    @IsOptional()
    page: number;

    @ApiProperty({description: '페이지당 개수. 기본값 20', required: false})
    @IsOptional()
    size: number;

    @ApiProperty({description: '페이지 탭에 보일 페이지 수. 기본값 10', required: false})
    @IsOptional()
    page_size: number;

    /**
     * @param data 요청 쿼리 — 빠진 값은 PAGINATION_DEFAULTS
     */
    constructor(data?: Partial<PaginationDto>) {
        this.all_search_yn = data?.all_search_yn ?? PAGINATION_DEFAULTS.all_search_yn;
        this.page = data?.page ?? PAGINATION_DEFAULTS.page;
        this.size = data?.size ?? PAGINATION_DEFAULTS.size;
        this.page_size = data?.page_size ?? PAGINATION_DEFAULTS.page_size;
    }
}

/**
 * 페이지 탭에 보일 페이지 번호 범위
 */
export class PageRangeResultDto {
    @ApiProperty({description: '시작 페이지'})
    start: number;

    @ApiProperty({description: '끝 페이지'})
    end: number;
}

/**
 * 목록 응답 `{list, pagination}` 의 pagination
 */
export class PaginationResultDto {
    @ApiProperty({description: '전체 조회 여부(Y/N)', enum: ['Y', 'N']})
    all_search_yn: 'Y' | 'N';

    @ApiProperty({description: '총 개수'})
    total_count: number;

    @ApiProperty({description: '현재 페이지 (범위를 벗어난 요청은 바로잡은 값)'})
    page: number;

    @ApiProperty({description: '마지막 페이지 (0건이어도 1)'})
    max_page: number;

    @ApiProperty({description: '페이지 탭에 보일 페이지 번호 범위', type: () => PageRangeResultDto})
    page_range: PageRangeResultDto;

    @ApiProperty({description: '이 페이지 첫 항목의 번호 — 총 개수부터 내려간다'})
    content_start_number: number;

    @ApiProperty({description: '이 페이지 첫 항목의 번호 — 1부터 올라간다'})
    content_start_number_reverse: number;
}
