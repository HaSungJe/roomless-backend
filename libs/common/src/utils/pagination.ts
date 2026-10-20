import {PAGINATION_DEFAULTS, PageRangeResultDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/** Pagination 입력 — 쿼리 값은 문자열로 들어오므로 숫자 · 문자열을 모두 받는다 */
export interface PaginationInput {
    /** 전체 조회 여부 — 'Y' 가 아니면 모두 N */
    all_search_yn: string;
    /** 총 개수 (repository count 결과) */
    total_count: number | string;
    /** 요청 페이지 */
    page: number | string;
    /** 페이지당 개수 */
    size: number | string;
    /** 페이지 탭에 보일 페이지 수 */
    page_size: number | string;
}

/**
 * 목록 페이지 계산 — 순서는 count → Pagination → 목록.
 * 총 개수로 현재 페이지를 바로잡고, 목록 조회의 limit · offset 과 응답의 pagination 을 만든다.
 * 숫자가 아니거나 범위를 벗어난 값은 던지지 않고 바로잡는다(안전망 — 기본값의 사양은 PaginationDto 생성자).
 * 계산 결과를 들고 다니는 값 객체라 util 중 유일하게 class 다.
 */
export class Pagination {
    /** 전체 조회 여부 — Y 면 한 페이지에 전부 */
    readonly all_search_yn: 'Y' | 'N';
    /** 총 개수 */
    readonly total_count: number;
    /** 현재 페이지 (1 ~ max_page) */
    readonly page: number;
    /** 페이지당 개수 (전체 조회면 총 개수) */
    readonly size: number;
    /** 페이지 탭에 보일 페이지 수 */
    readonly page_size: number;
    /** 마지막 페이지 (0건이어도 1) */
    readonly max_page: number;
    /** 페이지 탭에 보일 페이지 번호 범위 */
    readonly page_range: PageRangeResultDto;
    /** 목록 조회 limit */
    readonly limit: number;
    /** 목록 조회 offset */
    readonly offset: number;

    /**
     * @param input 요청 페이지 값 + 총 개수
     */
    constructor(input: PaginationInput) {
        const allSearch = input.all_search_yn === 'Y';
        const totalCount = toInt(input.total_count, 0, 0);
        const pageSize = toInt(input.page_size, 1, PAGINATION_DEFAULTS.page_size);
        const size = allSearch ? totalCount : toInt(input.size, 1, PAGINATION_DEFAULTS.size);
        const maxPage = allSearch ? 1 : Math.max(Math.ceil(totalCount / size), 1);
        const page = allSearch ? 1 : Math.min(toInt(input.page, 1, PAGINATION_DEFAULTS.page), maxPage);
        const rangeEnd = Math.ceil(page / pageSize) * pageSize;

        this.all_search_yn = allSearch ? 'Y' : 'N';
        this.total_count = totalCount;
        this.page = page;
        this.size = size;
        this.page_size = pageSize;
        this.max_page = maxPage;
        this.page_range = toPageRange(rangeEnd - pageSize + 1, Math.min(rangeEnd, maxPage));
        this.limit = size;
        this.offset = (page - 1) * size;
    }

    /**
     * 목록 응답의 pagination 을 만든다.
     *
     * @returns 페이지 정보
     */
    getPagination(): PaginationResultDto {
        const result = new PaginationResultDto();
        result.all_search_yn = this.all_search_yn;
        result.total_count = this.total_count;
        result.page = this.page;
        result.max_page = this.max_page;
        result.page_range = toPageRange(this.page_range.start, this.page_range.end);
        result.content_start_number = this.total_count - (this.page - 1) * this.size;
        result.content_start_number_reverse = 1 + (this.page - 1) * this.size;
        return result;
    }
}

/**
 * 정수로 읽는다 — 숫자가 아니거나 min 보다 작으면 fallback.
 *
 * @param value 숫자 또는 쿼리 문자열
 * @param min 허용하는 가장 작은 값
 * @param fallback 대신 쓸 값
 * @returns 정수
 */
function toInt(value: number | string, min: number, fallback: number): number {
    const parsed = parseInt(String(value), 10);
    return Number.isNaN(parsed) || parsed < min ? fallback : parsed;
}

/**
 * 페이지 번호 범위 DTO 를 만든다.
 *
 * @param start 시작 페이지
 * @param end 끝 페이지
 * @returns 페이지 번호 범위
 */
function toPageRange(start: number, end: number): PageRangeResultDto {
    const range = new PageRangeResultDto();
    range.start = start;
    range.end = end;
    return range;
}
