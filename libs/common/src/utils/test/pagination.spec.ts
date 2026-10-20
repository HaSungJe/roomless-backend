import {plainToInstance} from 'class-transformer';
import {PageRangeResultDto, PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';
import {Pagination, type PaginationInput} from '@app/common/utils/pagination.js';

/**
 * Pagination 입력 — 케이스마다 바꾸는 값만 넘긴다.
 *
 * @param override 덮어쓸 값
 * @returns 기본 입력(N · 95건 · 1페이지 · 20개 · 10페이지 묶음) + 덮어쓴 값
 */
function input(override: Partial<PaginationInput>): PaginationInput {
    return {all_search_yn: 'N', total_count: 95, page: 1, size: 20, page_size: 10, ...override};
}

describe('[CASES:Pagination] 목록 페이지 계산', () => {
    it('1. 기본 — limit · offset · 페이지 범위 · 번호 시작값을 계산하고, 결과는 DTO 인스턴스다', () => {
        const pagination = new Pagination(input({}));
        const result = pagination.getPagination();

        expect(pagination.limit).toBe(20);
        expect(pagination.offset).toBe(0);
        expect(result).toBeInstanceOf(PaginationResultDto);
        expect(result.page_range).toBeInstanceOf(PageRangeResultDto);
        expect(result).toEqual({all_search_yn: 'N', total_count: 95, page: 1, max_page: 5, page_range: {start: 1, end: 5}, content_start_number: 95, content_start_number_reverse: 1});
    });

    it('2. 쿼리 문자열 — 문자열 값을 정수로 읽는다', () => {
        const pagination = new Pagination({all_search_yn: 'N', total_count: '95', page: '3', size: '20', page_size: '10'});

        expect(pagination.offset).toBe(40);
        expect(pagination.getPagination()).toEqual({
            all_search_yn: 'N',
            total_count: 95,
            page: 3,
            max_page: 5,
            page_range: {start: 1, end: 5},
            content_start_number: 55,
            content_start_number_reverse: 41,
        });
    });

    it.each([
        [100, 5],
        [101, 6],
    ])('3. 나누어떨어지는 경계 — 총 %i건 · 20개씩이면 max_page %i', (total_count, max_page) => {
        expect(new Pagination(input({total_count})).max_page).toBe(max_page);
    });

    it.each([[0], ['-2']])('4. 1 보다 작은 page(%s) — 1페이지로 바로잡는다', (page) => {
        const pagination = new Pagination(input({page}));

        expect(pagination.page).toBe(1);
        expect(pagination.offset).toBe(0);
    });

    it('5. max_page 를 넘는 page — 마지막 페이지로 바로잡는다', () => {
        const pagination = new Pagination(input({page: 9}));

        expect(pagination.page).toBe(5);
        expect(pagination.offset).toBe(80);
        expect(pagination.getPagination()).toMatchObject({page: 5, content_start_number: 15, content_start_number_reverse: 81});
    });

    it('6. 0건 — max_page 1 · 1페이지 · 번호 시작값 0', () => {
        const pagination = new Pagination(input({total_count: 0, page: 3}));

        expect(pagination.offset).toBe(0);
        expect(pagination.getPagination()).toEqual({
            all_search_yn: 'N',
            total_count: 0,
            page: 1,
            max_page: 1,
            page_range: {start: 1, end: 1},
            content_start_number: 0,
            content_start_number_reverse: 1,
        });
    });

    it('7. 전체 조회(Y) — 요청 page · size 와 무관하게 한 페이지에 전부', () => {
        const pagination = new Pagination(input({all_search_yn: 'Y', page: 3}));

        expect(pagination.all_search_yn).toBe('Y');
        expect(pagination.page).toBe(1);
        expect(pagination.max_page).toBe(1);
        expect(pagination.size).toBe(95);
        expect(pagination.limit).toBe(95);
        expect(pagination.offset).toBe(0);
        expect(pagination.page_range).toEqual({start: 1, end: 1});
    });

    it.each([['X'], ['y']])('8. Y/N 이 아닌 값(%s) — N 으로 계산한다', (all_search_yn) => {
        const pagination = new Pagination(input({all_search_yn, page: 2}));

        expect(pagination.all_search_yn).toBe('N');
        expect(pagination.page).toBe(2);
        expect(pagination.offset).toBe(20);
    });

    it.each([
        [10, 1, 10],
        [13, 11, 20],
        [23, 21, 25],
    ])('9. 페이지 탭 묶음 — 500건 · 20개씩(max 25) · 10페이지 묶음에서 %i페이지 → %i ~ %i', (page, start, end) => {
        expect(new Pagination(input({total_count: 500, page})).page_range).toEqual({start, end});
    });

    it('10. 숫자가 아닌 값 — page 1 · size 20 · page_size 10 · 총 0건으로 본다', () => {
        const pagination = new Pagination({all_search_yn: 'N', total_count: 'abc', page: 'abc', size: '', page_size: 'x'});

        expect(pagination.page).toBe(1);
        expect(pagination.size).toBe(20);
        expect(pagination.page_size).toBe(10);
        expect(pagination.total_count).toBe(0);
        expect(pagination.max_page).toBe(1);
        expect(pagination.limit).toBe(20);
    });

    it('11. 0 이하 size · page_size — 기본값으로 보고, 0 나누기로 Infinity 가 되지 않는다', () => {
        const pagination = new Pagination(input({size: '0', page_size: '-1'}));

        expect(pagination.size).toBe(20);
        expect(pagination.page_size).toBe(10);
        expect(pagination.max_page).toBe(5);
    });
});

describe('[CASES:PaginationDto] 페이지 기본값', () => {
    it('12. 생성자 기본값 — 인자 없이 · 일부만 · ValidationPipe 경로(plainToInstance) 모두 기본값이 채워진다', () => {
        expect({...new PaginationDto()}).toEqual({all_search_yn: 'N', page: 1, size: 20, page_size: 10});
        expect({...new PaginationDto({page: 2, all_search_yn: 'Y'})}).toEqual({all_search_yn: 'Y', page: 2, size: 20, page_size: 10});
        expect({...plainToInstance(PaginationDto, {page: '3'})}).toEqual({all_search_yn: 'N', page: '3', size: 20, page_size: 10});
    });
});
