# DTO — stats

> `libs/contracts/src/stats/dto/` 에서 Swagger 데코레이터(`@nestjs/swagger`)만 뺀 사본 — 기준: 백엔드 Phase 27(2026-11-10). `class-validator` · `class-transformer` 데코레이터와 한국어 메시지는 그대로다(화면 입력 검증에 그대로 쓴다). 프론트에는 `contracts/stats/dto/<파일>` 로 둔다. 이후 바뀐 DTO 는 `changes/` 로 온다.

## stats/dto/stats-mine.dto.ts

```ts
import {IsIn, IsOptional, Matches} from 'class-validator';

/**
 * 내 업체 통계 query (업체 총관리자 · 업체 관리자) — 월 기간 · 결제 환경
 */
export class StatsMineDto {
    /** 시작 월 (YYYY-MM, 한국) — 없으면 끝 월 − 2개월(3개월) */
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '시작 월을 YYYY-MM 으로 입력해주세요.'})
    start_month: string | null;

    /** 끝 월 (YYYY-MM, 한국) — 없으면 이번 달 */
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '끝 월을 YYYY-MM 으로 입력해주세요.'})
    end_month: string | null;

    /** 결제 환경 (LIVE: 실결제, TEST: 토스 테스트 키) — 기본 LIVE — 값: LIVE · TEST */
    @IsOptional()
    @IsIn(['LIVE', 'TEST'], {message: '결제 환경이 올바르지 않습니다.'})
    environment: string;

    /**
     * @param data 요청 쿼리 — 빠진 월은 null(서비스가 기본 기간), 환경 LIVE
     */
    constructor(data?: Partial<StatsMineDto>) {
        this.start_month = data?.start_month ?? null;
        this.end_month = data?.end_month ?? null;
        this.environment = data?.environment ?? 'LIVE';
    }
}

/**
 * 내 업체 통계 기간
 */
export class StatsMinePeriodResultDto {
    /** 시작 월 (YYYY-MM) */
    start_month: string;

    /** 끝 월 (YYYY-MM) */
    end_month: string;

    /** 결제 환경 (LIVE · TEST) */
    environment: string;
}

/**
 * 내 업체
 */
export class StatsMineStoreResultDto {
    /** 업체 ID */
    store_id: string;

    /** 상호명 */
    store_name: string;
}

/**
 * 내 업체 통계 값
 */
export class StatsMineSummaryResultDto {
    /** 이용자 수 — 이용 끝이 기간 안인 이용 완료 예약의 서로 다른 이용자 */
    user_count: number;

    /** 이용 건수 — 이용 끝이 기간 안인 이용 완료 예약 수 */
    completed_count: number;

    /** 결제액(원) — 승인 시각이 기간 안인 승인 결제 금액 합(기본 · 연장) */
    paid_amount: number;

    /** 환불액(원) — 환불 신청 시각이 기간 안인 환불 금액 합 */
    refund_amount: number;

    /** 수익(원) — 결제액 − 환불액(음수일 수 있다) */
    profit: number;
}

/**
 * 내 업체 월별 통계 1달
 */
export class StatsMineMonthResultDto extends StatsMineSummaryResultDto {
    /** 달 (YYYY-MM, 한국) */
    month: string;
}

/**
 * 내 업체 통계
 */
export class StatsMineResultDto {
    /** 기간 · 결제 환경 */
    period: StatsMinePeriodResultDto;

    /** 내 업체 */
    store: StatsMineStoreResultDto;

    /** 합계 */
    total: StatsMineSummaryResultDto;

    /** 월별 (기간의 모든 달, 오래된 달부터 — 활동 없는 달 0) */
    monthly: StatsMineMonthResultDto[];
}
```

## stats/dto/stats.dto.ts

```ts
import {IsIn, IsOptional, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '../../common/pagination.dto';

/**
 * 전체 통계 query (총관리자 · 관리자) — 월 기간 · 결제 환경 · 업체 범위, 업체별 목록 페이지
 */
export class StatsDto extends PaginationDto {
    /** 시작 월 (YYYY-MM, 한국) — 없으면 끝 월 − 2개월(3개월) */
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '시작 월을 YYYY-MM 으로 입력해주세요.'})
    start_month: string | null;

    /** 끝 월 (YYYY-MM, 한국) — 없으면 이번 달 */
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '끝 월을 YYYY-MM 으로 입력해주세요.'})
    end_month: string | null;

    /** 결제 환경 (LIVE: 실결제, TEST: 토스 테스트 키) — 기본 LIVE — 값: LIVE · TEST */
    @IsOptional()
    @IsIn(['LIVE', 'TEST'], {message: '결제 환경이 올바르지 않습니다.'})
    environment: string;

    /** 업체별 목록 범위 (1: 기간 안 활동이 있는 업체만, 0: 모든 업체) — 기본 1 — 값: 1 · 0 */
    @IsOptional()
    @IsIn(['1', '0'], {message: '업체 범위가 올바르지 않습니다.'})
    has_activity: string;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 월은 null(서비스가 기본 기간), 환경 LIVE · 범위 1
     */
    constructor(data?: Partial<StatsDto>) {
        super(data);
        this.start_month = data?.start_month ?? null;
        this.end_month = data?.end_month ?? null;
        this.environment = data?.environment ?? 'LIVE';
        this.has_activity = data?.has_activity ?? '1';
    }
}

/**
 * 통계 기간
 */
export class StatsPeriodResultDto {
    /** 시작 월 (YYYY-MM) */
    start_month: string;

    /** 끝 월 (YYYY-MM) */
    end_month: string;

    /** 결제 환경 (LIVE · TEST) */
    environment: string;
}

/**
 * 통계 값 — 이용자 수(이용 완료한 서로 다른 이용자) · 이용 건수 · 결제액 · 환불액 · 수익
 */
export class StatsSummaryResultDto {
    /** 이용자 수 — 이용 끝이 기간 안인 이용 완료 예약의 서로 다른 이용자(이 범위에서 중복 제거) */
    user_count: number;

    /** 이용 건수 — 이용 끝이 기간 안인 이용 완료 예약 수 */
    completed_count: number;

    /** 결제액(원) — 승인 시각이 기간 안인 승인 결제 금액 합(기본 · 연장) */
    paid_amount: number;

    /** 환불액(원) — 환불 신청 시각이 기간 안인 환불 금액 합 */
    refund_amount: number;

    /** 수익(원) — 결제액 − 환불액(음수일 수 있다) */
    profit: number;
}

/**
 * 월별 통계 1달
 */
export class StatsMonthResultDto extends StatsSummaryResultDto {
    /** 달 (YYYY-MM, 한국) */
    month: string;
}

/**
 * 업체별 통계 1업체
 */
export class StatsStoreResultDto extends StatsSummaryResultDto {
    /** 업체 ID */
    store_id: string;

    /** 상호명 */
    store_name: string;

    /** 업체코드 */
    store_code: string;

    /** 업체 상태 (ACTIVE · SUSPEND · LEAVE) */
    store_state_id: string;
}

/**
 * 업체별 통계 목록
 */
export class StatsStoreListResultDto {
    /** 목록 (수익 내림차순, 같으면 상호명 순) */
    list: StatsStoreResultDto[];

    /** 페이지 정보 */
    pagination: PaginationResultDto;
}

/**
 * 전체 통계
 */
export class StatsResultDto {
    /** 기간 · 결제 환경 */
    period: StatsPeriodResultDto;

    /** 합계 (이용자 수는 전체에서 중복 제거) */
    total: StatsSummaryResultDto;

    /** 월별 (기간의 모든 달, 오래된 달부터 — 활동 없는 달 0) */
    monthly: StatsMonthResultDto[];

    /** 업체별 */
    stores: StatsStoreListResultDto;
}
```
