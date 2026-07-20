import { PaginationResultDto } from '../dto/pagination.dto';

type PaginationDataType = {
    all_search_yn: 'Y' | 'N';
    total_count: string | number;
    page: string | number;
    size: string | number;
    page_size: string | number;
}

/**
 * 페이징
 */
export class Pagination {
    public all_search_yn: 'Y' | 'N' = 'N'; // 전체검색 여부(Y/N)
    public size: number; // 페이지당 출력될 데이터 수
    public page_size: number; // 페이지탭에 출력될 페이지의 수
    public total_count: number; // 총 게시글 수
    public page: number; // 현재 페이지
    public max_page: number; // 마지막 페이지
    public page_range: any; // 페이지탭에 출력될 페이지의 시작과 끝 값
    public limit: number; // Query용 limit 값
    public offset: number; // Query용 offset 값

    constructor(data: PaginationDataType) {
        this.all_search_yn = ['Y', 'N'].includes(data.all_search_yn) ? data.all_search_yn : 'N';
        this.total_count = !isNaN(parseInt(data.total_count as string)) ? parseInt(data.total_count as string) : 1;
        this.page = !isNaN(parseInt(data.page as string)) ? parseInt(data.page as string) : 1;
        this.size = !isNaN(parseInt(data.size as string)) ? parseInt(data.size as string) : 20;
        this.page_size = !isNaN(parseInt(data.page_size as string)) ? parseInt(data.page_size as string) : 10;

        // 현재페이지가 1보다 작을경우, 1로 변경
        if (this.page <= 0) {
            this.page = 1;
        }

        // 최대 페이지 수
        this.max_page = Math.floor(this.total_count / this.size);
        if (this.total_count % this.size > 0) {
            this.max_page++;
        }

        // 페이지당 출력될 개수가 -1인 경우, 전체 출력
        if (this.all_search_yn === 'Y') {
            this.page = 1;
            this.max_page = 1;
            this.size = this.total_count;
        }

        // 총 개수가 0일 경우, 최대페이지를 기본 1로 설정.
        if (this.max_page === 0) {
            this.max_page = 1;
        }

        // 현재페이지가 최대페이지를 넘어설 경우, 현재페이지를 최대페이지로 변경
        if (this.page > this.max_page) {
            this.page = this.max_page;
        }

        // mysql 검색용 limit
        this.limit = this.size;
        this.offset = (this.page - 1) * this.size;

        // 노출할 페이지 목록 수
        this.page_range = { start: 0, end: 0 };

        this.page_range.end = Math.floor(this.page / this.page_size);
        if (this.page % this.page_size > 0) {
            this.page_range.end++;
        }

        this.page_range.end = this.page_range.end * this.page_size;
        this.page_range.start = this.page_range.end - (this.page_size - 1);
        if (this.page_range.end > this.max_page) {
            this.page_range.end = this.max_page;
        }
    }

    getPagination(): PaginationResultDto {
        return {
            all_search_yn: this.all_search_yn,
            total_count: this.total_count,
            page: this.page,
            max_page: this.max_page,
            page_range: this.page_range,
            content_start_number: this.total_count - (this.page - 1) * this.size,
            content_start_number_reverse: 1 + (this.page - 1) * this.size,
        };
    }
}
