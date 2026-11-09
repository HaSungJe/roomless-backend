# Plan — stats

## Feature Summary
- **Feature**: 통계(Phase 21) — 월 단위 기간(기본 이번 달 포함 최근 3개월, 최대 12개월)의 이용자 수 · 이용 건수 · 결제액 · 환불액 · 수익을 합계 · 월별로. 총관리자 · 관리자는 전체 + 업체별 목록(기본 활동 있는 업체만, 필터로 모든 업체), 업체 관리자는 자기 업체만. 결제 환경 LIVE · TEST 선택
- **Entry point**: `GET /api/v1/admin-service/stats`(관리자 가드) · `GET /api/v1/admin-service/stats/mine`(매니저 가드) — 동기(내부 HTTP)만
- **Domain**: stats(admin-service 새 도메인) — 로드맵 Phase 21 #86. 읽기만, 스키마 변경 없음
- **Spec**: [stats-spec.md](../../spec/stats/stats-spec.md)

### 구현 단위 (순서)
- A. contracts — `STATS_INTERNAL_PATH`, DTO 2(전체 · 내 업체)
- B. admin-service stats — util(TDD 먼저: 기간 계산 · 통계 모으기) → repository(이용 GROUPING SETS · 결제 · 환불 · 매니저 소속 업체 · 업체) → service 2 → controller → module · 앱 등록
- C. gateway — `api/v1/admin-service/stats`(동기 2)
- D. 문서 — README · AGENTS(트리 · 라우트 · Smoke 목록) · docs(architecture · testing)

---

## File List

| File | Action |
|------|------|
| `libs/contracts/src/stats/stats.commands.ts` | new — `STATS_INTERNAL_PATH`(조회만 — 명령 없음) |
| `libs/contracts/src/stats/dto/stats.dto.ts` · `stats-mine.dto.ts` | new — 전체 통계 · 내 업체 통계 query · 결과 |
| `apps/admin-service/src/stats/stats.module.ts` · `stats.symbols.ts` · `stats.constants.ts` · `stats.util.ts` · `stats.service.ts` | new — 통계 도메인 |
| `apps/admin-service/src/stats/interfaces/stats.repository.interface.ts` · `repositories/stats.repository.ts` | new — 이용 · 결제 · 환불 집계 · 매니저 소속 업체 · 업체 읽기 |
| `apps/admin-service/src/stats/controllers/stats.controller.ts` | new — 내부 HTTP 2(큐 없음) |
| `apps/admin-service/src/admin-service.module.ts` | modified — `StatsModule` 등록 · 주석 |
| `apps/gateway/src/api/v1/admin-service/stats/stats.module.ts` · `controllers/stats.controller.ts` | new — 공개 라우트 2 |
| `apps/gateway/src/gateway.module.ts` | modified — `StatsModule` · 주석 |
| `apps/admin-service/src/stats/test/stats.test-helper.ts` · `stats.spec.ts` · `stats-mine.spec.ts` · `stats.repository.spec.ts` | new — 테스트 |
| `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/testing.md` | modified |

---

## Design

### A. contracts — Input/Validation (DTO) · 규격 상수

```ts
// libs/contracts/src/stats/stats.commands.ts — 새 파일
/**
 * 통계 도메인 내부 HTTP 경로 (게이트웨이 → admin-service). 조회만이라 RabbitMQ 명령은 없다.
 */
export const STATS_INTERNAL_PATH = {
    /** 전체 통계 (GET, 총관리자 · 관리자) */
    ALL: '/internal/v1/admin-service/stats',
    /** 내 업체 통계 (GET, 업체 총관리자 · 업체 관리자) */
    MINE: '/internal/v1/admin-service/stats/mine',
} as const;
```

```ts
// libs/contracts/src/stats/dto/stats.dto.ts — 새 파일
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 전체 통계 query (총관리자 · 관리자) — 월 기간 · 결제 환경 · 업체 범위, 업체별 목록 페이지
 */
export class StatsDto extends PaginationDto {
    @ApiProperty({description: '시작 월 (YYYY-MM, 한국) — 없으면 끝 월 − 2개월(3개월)', required: false})
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '시작 월을 YYYY-MM 으로 입력해주세요.'})
    start_month: string | null;

    @ApiProperty({description: '끝 월 (YYYY-MM, 한국) — 없으면 이번 달', required: false})
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '끝 월을 YYYY-MM 으로 입력해주세요.'})
    end_month: string | null;

    @ApiProperty({description: '결제 환경 (LIVE: 실결제, TEST: 토스 테스트 키) — 기본 LIVE', required: false, enum: ['LIVE', 'TEST']})
    @IsOptional()
    @IsIn(['LIVE', 'TEST'], {message: '결제 환경이 올바르지 않습니다.'})
    environment: string;

    @ApiProperty({description: '업체별 목록 범위 (1: 기간 안 활동이 있는 업체만, 0: 모든 업체) — 기본 1', required: false, enum: ['1', '0']})
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
    @ApiProperty({description: '시작 월 (YYYY-MM)'})
    start_month: string;

    @ApiProperty({description: '끝 월 (YYYY-MM)'})
    end_month: string;

    @ApiProperty({description: '결제 환경 (LIVE · TEST)'})
    environment: string;
}

/**
 * 통계 값 — 이용자 수(이용 완료한 서로 다른 이용자) · 이용 건수 · 결제액 · 환불액 · 수익
 */
export class StatsSummaryResultDto {
    @ApiProperty({description: '이용자 수 — 이용 끝이 기간 안인 이용 완료 예약의 서로 다른 이용자(이 범위에서 중복 제거)'})
    user_count: number;

    @ApiProperty({description: '이용 건수 — 이용 끝이 기간 안인 이용 완료 예약 수'})
    completed_count: number;

    @ApiProperty({description: '결제액(원) — 승인 시각이 기간 안인 승인 결제 금액 합(기본 · 연장)'})
    paid_amount: number;

    @ApiProperty({description: '환불액(원) — 환불 신청 시각이 기간 안인 환불 금액 합'})
    refund_amount: number;

    @ApiProperty({description: '수익(원) — 결제액 − 환불액(음수일 수 있다)'})
    profit: number;
}

/**
 * 월별 통계 1달
 */
export class StatsMonthResultDto extends StatsSummaryResultDto {
    @ApiProperty({description: '달 (YYYY-MM, 한국)'})
    month: string;
}

/**
 * 업체별 통계 1업체
 */
export class StatsStoreResultDto extends StatsSummaryResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '업체코드'})
    store_code: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE)'})
    store_state_id: string;
}

/**
 * 업체별 통계 목록
 */
export class StatsStoreListResultDto {
    @ApiProperty({description: '목록 (수익 내림차순, 같으면 상호명 순)', type: () => [StatsStoreResultDto]})
    list: StatsStoreResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}

/**
 * 전체 통계
 */
export class StatsResultDto {
    @ApiProperty({description: '기간 · 결제 환경', type: () => StatsPeriodResultDto})
    period: StatsPeriodResultDto;

    @ApiProperty({description: '합계 (이용자 수는 전체에서 중복 제거)', type: () => StatsSummaryResultDto})
    total: StatsSummaryResultDto;

    @ApiProperty({description: '월별 (기간의 모든 달, 오래된 달부터 — 활동 없는 달 0)', type: () => [StatsMonthResultDto]})
    monthly: StatsMonthResultDto[];

    @ApiProperty({description: '업체별', type: () => StatsStoreListResultDto})
    stores: StatsStoreListResultDto;
}
```

```ts
// libs/contracts/src/stats/dto/stats-mine.dto.ts — 새 파일
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, Matches} from 'class-validator';

/**
 * 내 업체 통계 query (업체 총관리자 · 업체 관리자) — 월 기간 · 결제 환경
 */
export class StatsMineDto {
    @ApiProperty({description: '시작 월 (YYYY-MM, 한국) — 없으면 끝 월 − 2개월(3개월)', required: false})
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '시작 월을 YYYY-MM 으로 입력해주세요.'})
    start_month: string | null;

    @ApiProperty({description: '끝 월 (YYYY-MM, 한국) — 없으면 이번 달', required: false})
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {message: '끝 월을 YYYY-MM 으로 입력해주세요.'})
    end_month: string | null;

    @ApiProperty({description: '결제 환경 (LIVE: 실결제, TEST: 토스 테스트 키) — 기본 LIVE', required: false, enum: ['LIVE', 'TEST']})
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
    @ApiProperty({description: '시작 월 (YYYY-MM)'})
    start_month: string;

    @ApiProperty({description: '끝 월 (YYYY-MM)'})
    end_month: string;

    @ApiProperty({description: '결제 환경 (LIVE · TEST)'})
    environment: string;
}

/**
 * 내 업체
 */
export class StatsMineStoreResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;
}

/**
 * 내 업체 통계 값
 */
export class StatsMineSummaryResultDto {
    @ApiProperty({description: '이용자 수 — 이용 끝이 기간 안인 이용 완료 예약의 서로 다른 이용자'})
    user_count: number;

    @ApiProperty({description: '이용 건수'})
    completed_count: number;

    @ApiProperty({description: '결제액(원) — 승인 시각 기준'})
    paid_amount: number;

    @ApiProperty({description: '환불액(원) — 환불 신청 시각 기준'})
    refund_amount: number;

    @ApiProperty({description: '수익(원) — 결제액 − 환불액(음수일 수 있다)'})
    profit: number;
}

/**
 * 내 업체 월별 통계 1달
 */
export class StatsMineMonthResultDto extends StatsMineSummaryResultDto {
    @ApiProperty({description: '달 (YYYY-MM, 한국)'})
    month: string;
}

/**
 * 내 업체 통계
 */
export class StatsMineResultDto {
    @ApiProperty({description: '기간 · 결제 환경', type: () => StatsMinePeriodResultDto})
    period: StatsMinePeriodResultDto;

    @ApiProperty({description: '내 업체', type: () => StatsMineStoreResultDto})
    store: StatsMineStoreResultDto;

    @ApiProperty({description: '합계', type: () => StatsMineSummaryResultDto})
    total: StatsMineSummaryResultDto;

    @ApiProperty({description: '월별 (기간의 모든 달, 오래된 달부터 — 활동 없는 달 0)', type: () => [StatsMineMonthResultDto]})
    monthly: StatsMineMonthResultDto[];
}
```

### B. admin-service stats — 계산 util (TDD 먼저)

```ts
// apps/admin-service/src/stats/stats.constants.ts — 새 파일
/**
 * 통계 도메인 상수 — 기간 · 집계 대상 상태.
 */

/** 기본 기간 — 이번 달 포함 최근 3개월(사용자 결정 2026-11-09) */
export const STATS_DEFAULT_MONTHS = 3;

/** 최대 기간 — 12개월 */
export const STATS_MAX_MONTHS = 12;

/** 달 형식 */
export const STATS_MONTH_FORMAT = 'YYYY-MM';

/** 결제액에 드는 결제 상태 — 승인된 결제(뒤에 환불이 생겨도 결제액은 승인 시각에 센다) */
export const STATS_PAID_STATES = ['DONE', 'REFUND_REQUESTED', 'REFUNDED', 'REFUND_FAILED'];

/** 환불액에 드는 결제 상태 — 환불 신청 이후(실패도 돌려줘야 할 돈이라 센다) */
export const STATS_REFUND_STATES = ['REFUND_REQUESTED', 'REFUNDED', 'REFUND_FAILED'];

/** 업체 범위 — 모든 업체 */
export const STATS_ALL_STORES = '0';

/** 탈퇴 업체 상태 — 업체 관리자 통계에서 소속 업체로 보지 않는다 */
export const STATS_STORE_STATE_LEAVE = 'LEAVE';
```

```ts
// apps/admin-service/src/stats/stats.util.ts — 새 파일
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';
import type {StatsMonthResultDto, StatsStoreResultDto, StatsSummaryResultDto} from '@app/contracts/stats/dto/stats.dto.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {StatsAmountRow, StatsUsageRow} from './interfaces/stats.repository.interface.js';
import {STATS_DEFAULT_MONTHS, STATS_MAX_MONTHS, STATS_MONTH_FORMAT} from './stats.constants.js';

/** 통계 기간 — 월 목록(오래된 달부터) · 한국 시각 [시작 월 1일, 끝 다음 달 1일) */
export interface StatsPeriod {
    start_month: string;
    end_month: string;
    months: string[];
    from: Date;
    to: Date;
}

/** 통계 모으기 결과 — 합계 · 월별 · 업체별(수익 내림차순) */
export interface StatsAggregate {
    total: StatsSummaryResultDto;
    monthly: StatsMonthResultDto[];
    stores: StatsStoreResultDto[];
}

/**
 * 파일 전용 — 'YYYY-MM' 을 그 달 1일(서버 시간대 무관한 달 계산용)로.
 *
 * @param month 달
 * @returns 그 달 1일
 */
function toMonthStart(month: string): Dayjs {
    return dayjs(`${month}-01`, 'YYYY-MM-DD', true);
}

/**
 * 파일 전용 — 그 달 1일 00:00 한국 시각.
 *
 * @param month 달
 * @returns 시각
 */
function toKstMonthStart(month: string): Date {
    return dayjs.tz(`${month}-01 00:00`, 'YYYY-MM-DD HH:mm', KST_TIMEZONE).toDate();
}

/**
 * 통계 기간 — 시작 · 끝 월(선택)과 지금으로 정한다. 끝이 없으면 이번 달(한국), 시작이 없으면 끝 − 2개월(이번 달 포함 3개월).
 * 시작 > 끝 · 12개월 초과는 사유(사용자 결정 2026-11-09).
 *
 * @param start_month 시작 월 또는 null
 * @param end_month 끝 월 또는 null
 * @param now 지금
 * @returns 기간 또는 못 하는 사유
 */
export function resolveStatsPeriod(start_month: string | null, end_month: string | null, now: Dayjs): StatsPeriod | string {
    const end = toMonthStart(end_month ?? now.tz(KST_TIMEZONE).format(STATS_MONTH_FORMAT));
    const start = start_month ? toMonthStart(start_month) : end.subtract(STATS_DEFAULT_MONTHS - 1, 'month');
    if (start.isAfter(end)) {
        return '시작 월이 끝 월보다 늦습니다.';
    }
    const count = end.diff(start, 'month') + 1;
    if (count > STATS_MAX_MONTHS) {
        return `기간은 최대 ${STATS_MAX_MONTHS}개월입니다.`;
    }
    const months = Array.from({length: count}, (_, index) => start.add(index, 'month').format(STATS_MONTH_FORMAT));
    return {
        start_month: months[0],
        end_month: months[months.length - 1],
        months,
        from: toKstMonthStart(months[0]),
        to: toKstMonthStart(end.add(1, 'month').format(STATS_MONTH_FORMAT)),
    };
}

/**
 * 파일 전용 — 빈 통계 값.
 *
 * @returns 모두 0
 */
function emptySummary(): StatsSummaryResultDto {
    return {user_count: 0, completed_count: 0, paid_amount: 0, refund_amount: 0, profit: 0};
}

/**
 * 파일 전용 — 결제액 · 환불액을 더하고 수익을 다시 계산한다.
 *
 * @param target 더할 대상
 * @param paid 결제액
 * @param refund 환불액
 */
function addAmounts(target: StatsSummaryResultDto, paid: number, refund: number): void {
    target.paid_amount += paid;
    target.refund_amount += refund;
    target.profit = target.paid_amount - target.refund_amount;
}

/**
 * 활동이 있는 업체 ID — 이용(업체별 행) · 결제 · 환불 행에 나온 업체(중복 없이).
 *
 * @param usage 이용 집계 행
 * @param payments 결제 집계 행
 * @param refunds 환불 집계 행
 * @returns 업체 ID 목록
 */
export function collectStatsStoreIds(usage: StatsUsageRow[], payments: StatsAmountRow[], refunds: StatsAmountRow[]): string[] {
    const ids = new Set<string>();
    for (const row of usage) {
        if (Number(row.grouping_store) === 0 && row.store_id) {
            ids.add(row.store_id);
        }
    }
    for (const row of [...payments, ...refunds]) {
        ids.add(row.store_id);
    }
    return [...ids];
}

/**
 * 통계 모으기 — 이용 집계(GROUPING SETS 업체 · 달 · 전체 — 이용자 수는 범위마다 중복 제거) · 결제 · 환불 집계((업체, 달) 합)를
 * 합계 · 월별(기간의 모든 달, 빈 달 0) · 업체별(받은 업체 전부, 수익 내림차순 → 상호명 순)로. 집계 값은 문자열이 올 수 있어 숫자로 바꾼다.
 *
 * @param months 기간의 달(오래된 달부터)
 * @param usage 이용 집계 행
 * @param payments 결제 집계 행
 * @param refunds 환불 집계 행
 * @param stores 목록에 넣을 업체
 * @returns 합계 · 월별 · 업체별
 */
export function toStats(months: string[], usage: StatsUsageRow[], payments: StatsAmountRow[], refunds: StatsAmountRow[], stores: Pick<StoreEntity, 'store_id' | 'store_name' | 'store_code' | 'store_state_id'>[]): StatsAggregate {
    const total = emptySummary();
    const monthly = new Map(months.map((month) => [month, {month, ...emptySummary()}]));
    const byStore = new Map(
        stores.map((store) => [store.store_id, {store_id: store.store_id, store_name: store.store_name, store_code: store.store_code, store_state_id: store.store_state_id, ...emptySummary()}]),
    );

    // 이용 — GROUPING(업체) · GROUPING(달)로 행을 가른다(1 = 그 축으로 묶지 않음)
    for (const row of usage) {
        const grouping_store = Number(row.grouping_store);
        const grouping_month = Number(row.grouping_month);
        const target = grouping_store === 1 && grouping_month === 1 ? total : grouping_store === 1 ? monthly.get(row.month ?? '') : byStore.get(row.store_id ?? '');
        if (target) {
            target.user_count = Number(row.user_count);
            target.completed_count = Number(row.completed_count);
        }
    }

    // 결제 · 환불 — (업체, 달) 합을 합계 · 그 달 · 그 업체에 더한다
    for (const [rows, kind] of [
        [payments, 'paid'],
        [refunds, 'refund'],
    ] as const) {
        for (const row of rows) {
            const amount = Number(row.amount);
            const paid = kind === 'paid' ? amount : 0;
            const refund = kind === 'refund' ? amount : 0;
            addAmounts(total, paid, refund);
            const month = monthly.get(row.month);
            if (month) {
                addAmounts(month, paid, refund);
            }
            const store = byStore.get(row.store_id);
            if (store) {
                addAmounts(store, paid, refund);
            }
        }
    }

    return {
        total,
        monthly: [...monthly.values()],
        stores: [...byStore.values()].sort((a, b) => b.profit - a.profit || a.store_name.localeCompare(b.store_name, 'ko')),
    };
}
```

> util 의 파일 전용 헬퍼(`toMonthStart` · `toKstMonthStart` · `emptySummary` · `addAmounts`)는 AGENTS "파일 전용 헬퍼(export 안 함)는 인프라 · util 파일에만" 에 맞다.

### B. admin-service stats — Data Access

```ts
// apps/admin-service/src/stats/stats.symbols.ts — 새 파일
/** 통계 repository 포트 토큰 — 구현: StatsRepository */
export const STATS_REPOSITORY = Symbol('StatsRepositoryInterface');
```

```ts
// apps/admin-service/src/stats/interfaces/stats.repository.interface.ts — 새 파일
import type {FindOptionsWhere} from 'typeorm';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 통계 집계 조건 — 한국 시각 기간 [from, to) · 결제 환경 · 업체(내 업체 통계 — 전체면 null) */
export interface StatsFilter {
    from: Date;
    to: Date;
    environment: string;
    store_id: string | null;
}

/** 이용 집계 행 — GROUPING SETS((업체), (달), ()) 결과. grouping_* 1 이면 그 축으로 묶지 않은 행 (QueryBuilder raw) */
export interface StatsUsageRow {
    store_id: string | null;
    month: string | null;
    grouping_store: number | string;
    grouping_month: number | string;
    user_count: number | string;
    completed_count: number | string;
}

/** 결제 · 환불 집계 행 — (업체, 달) 합 (QueryBuilder raw) */
export interface StatsAmountRow {
    store_id: string;
    month: string;
    amount: number | string;
}

/**
 * 통계 repository 포트 — 공유 DB 의 예약 · 구간 · 결제 · 업체 · 회원을 통계 어휘로 읽기만 한다(쓰기 없음).
 */
export interface StatsRepositoryInterface {
    /** 업체 관리자의 소속 업체 — 매니저 그룹 · 탈퇴 아닌 · 지워지지 않은 업체 */
    findManagerStore(user_id: string): Promise<StoreEntity | null>;
    /** 이용 집계 — 업체별 · 월별 · 전체(이용자 수는 범위마다 중복 제거) */
    findUsageRows(filter: StatsFilter): Promise<StatsUsageRow[]>;
    /** 결제 집계 — (업체, 승인 달) 결제액 */
    findPaymentRows(filter: StatsFilter): Promise<StatsAmountRow[]>;
    /** 환불 집계 — (업체, 환불 신청 달) 환불액 */
    findRefundRows(filter: StatsFilter): Promise<StatsAmountRow[]>;
    /** 업체별 목록에 넣을 업체 — 지워지지 않은 업체 */
    findStatsStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]>;
}
```

```ts
// apps/admin-service/src/stats/repositories/stats.repository.ts — 새 파일
import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {RESERVATION_DETAIL_TYPE, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import type {StatsAmountRow, StatsFilter, StatsRepositoryInterface, StatsUsageRow} from '../interfaces/stats.repository.interface.js';
import {STATS_PAID_STATES, STATS_REFUND_STATES, STATS_STORE_STATE_LEAVE} from '../stats.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/** 이용 달 — 이용 끝의 한국 달 */
const USAGE_MONTH = `to_char(r.end_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`;

/** 결제 달 — 승인 시각의 한국 달 */
const PAID_MONTH = `to_char(p.approved_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`;

/** 환불 달 — 환불 신청 시각의 한국 달 */
const REFUND_MONTH = `to_char(p.refund_requested_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`;

/**
 * 통계 repository(admin-service) — 이용 완료 예약 · 결제 · 환불을 집계 쿼리로 읽는다. 쓰기 없음.
 */
@Injectable()
export class StatsRepository implements StatsRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_reservation */
    private get reservations(): Repository<ReservationEntity> {
        return this.txHost.tx.getRepository(ReservationEntity);
    }

    /** t_payment */
    private get payments(): Repository<PaymentEntity> {
        return this.txHost.tx.getRepository(PaymentEntity);
    }

    /** t_store */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /**
     * 업체 관리자의 소속 업체
     *
     * @param user_id 로그인 매니저 ID
     * @returns 업체 또는 null
     */
    async findManagerStore(user_id: string): Promise<StoreEntity | null> {
        try {
            return await this.buildManagerStoreQuery(user_id).getOne();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 관리자의 소속 업체 쿼리 — 업체 예약 현황(admin-service reservation)과 같은 조건, 잠금 없음.
     * 매핑 민감(t_user 조인 · 관계 컬럼)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 로그인 매니저 ID
     * @returns 쿼리 빌더
     */
    buildManagerStoreQuery(user_id: string): SelectQueryBuilder<StoreEntity> {
        return this.stores
            .createQueryBuilder('s')
            .innerJoin(UserEntity, 'u', 'u.store_id = s.store_id')
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('s.store_state_id <> :leave', {leave: STATS_STORE_STATE_LEAVE})
            .andWhere('s.is_deleted = 0')
            .loadAllRelationIds();
    }

    /**
     * 이용 집계
     *
     * @param filter 기간 · 환경 · 업체
     * @returns 업체별 · 월별 · 전체 행
     */
    async findUsageRows(filter: StatsFilter): Promise<StatsUsageRow[]> {
        try {
            return await this.buildUsageQuery(filter).getRawMany<StatsUsageRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용 집계 쿼리 — 이용 완료 · 이용 끝이 기간 안 · 기본 구간 결제가 그 환경인 예약을 GROUPING SETS((업체), (달), ())로 센다.
     * 이용자 수는 범위마다 COUNT(DISTINCT) 라 합계를 업체별에서 더하지 않는다. 매핑 민감(조인 · raw select · GROUPING SETS · 동적 조립)이라 Smoke 로 SQL 을 고정한다.
     *
     * @param filter 기간 · 환경 · 업체
     * @returns 쿼리 빌더
     */
    buildUsageQuery(filter: StatsFilter): SelectQueryBuilder<ReservationEntity> {
        const query = this.reservations
            .createQueryBuilder('r')
            .select('r.store_id', 'store_id')
            .addSelect(USAGE_MONTH, 'month')
            .addSelect('GROUPING(r.store_id)', 'grouping_store')
            .addSelect(`GROUPING(${USAGE_MONTH})`, 'grouping_month')
            .addSelect('COUNT(DISTINCT r.user_id)', 'user_count')
            .addSelect('COUNT(*)', 'completed_count')
            .innerJoin(ReservationDetailEntity, 'd', 'd.reservation_id = r.reservation_id AND d.reservation_detail_type_id = :base', {base: RESERVATION_DETAIL_TYPE.BASE})
            .innerJoin(PaymentEntity, 'p', 'p.payment_id = d.payment_id')
            .where('r.reservation_state_id = :completed', {completed: RESERVATION_STATE.COMPLETED})
            .andWhere('r.end_at >= :from', {from: filter.from})
            .andWhere('r.end_at < :to', {to: filter.to})
            .andWhere('p.environment = :environment', {environment: filter.environment});
        if (filter.store_id !== null) {
            query.andWhere('r.store_id = :store_id', {store_id: filter.store_id});
        }
        return query.groupBy(`GROUPING SETS ((r.store_id), (${USAGE_MONTH}), ())`);
    }

    /**
     * 결제 집계
     *
     * @param filter 기간 · 환경 · 업체
     * @returns (업체, 달) 결제액
     */
    async findPaymentRows(filter: StatsFilter): Promise<StatsAmountRow[]> {
        try {
            return await this.buildPaymentQuery(filter).getRawMany<StatsAmountRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 집계 쿼리 — 승인된 결제(완료 · 환불 신청 · 환불 완료 · 환불 실패) 중 승인 시각이 기간 안 · 그 환경인 것을 구간 → 예약의 업체 · 승인 달로 더한다.
     * 매핑 민감(조인 · raw select · 동적 조립 · 시간대 달)이라 Smoke 로 SQL 을 고정한다.
     *
     * @param filter 기간 · 환경 · 업체
     * @returns 쿼리 빌더
     */
    buildPaymentQuery(filter: StatsFilter): SelectQueryBuilder<PaymentEntity> {
        const query = this.payments
            .createQueryBuilder('p')
            .select('r.store_id', 'store_id')
            .addSelect(PAID_MONTH, 'month')
            .addSelect('SUM(p.amount)', 'amount')
            .innerJoin(ReservationDetailEntity, 'd', 'd.payment_id = p.payment_id')
            .innerJoin(ReservationEntity, 'r', 'r.reservation_id = d.reservation_id')
            .where('p.payment_state_id IN (:...states)', {states: STATS_PAID_STATES})
            .andWhere('p.environment = :environment', {environment: filter.environment})
            .andWhere('p.approved_at >= :from', {from: filter.from})
            .andWhere('p.approved_at < :to', {to: filter.to});
        if (filter.store_id !== null) {
            query.andWhere('r.store_id = :store_id', {store_id: filter.store_id});
        }
        return query.groupBy('r.store_id').addGroupBy(PAID_MONTH);
    }

    /**
     * 환불 집계
     *
     * @param filter 기간 · 환경 · 업체
     * @returns (업체, 달) 환불액
     */
    async findRefundRows(filter: StatsFilter): Promise<StatsAmountRow[]> {
        try {
            return await this.buildRefundQuery(filter).getRawMany<StatsAmountRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 환불 집계 쿼리 — 환불 신청 이후(신청 · 완료 · 실패) 결제 중 환불 신청 시각이 기간 안 · 그 환경인 것의 환불 금액을 업체 · 신청 달로 더한다.
     * 매핑 민감(조인 · raw select · 동적 조립 · 시간대 달)이라 Smoke 로 SQL 을 고정한다.
     *
     * @param filter 기간 · 환경 · 업체
     * @returns 쿼리 빌더
     */
    buildRefundQuery(filter: StatsFilter): SelectQueryBuilder<PaymentEntity> {
        const query = this.payments
            .createQueryBuilder('p')
            .select('r.store_id', 'store_id')
            .addSelect(REFUND_MONTH, 'month')
            .addSelect('SUM(p.refund_amount)', 'amount')
            .innerJoin(ReservationDetailEntity, 'd', 'd.payment_id = p.payment_id')
            .innerJoin(ReservationEntity, 'r', 'r.reservation_id = d.reservation_id')
            .where('p.payment_state_id IN (:...states)', {states: STATS_REFUND_STATES})
            .andWhere('p.environment = :environment', {environment: filter.environment})
            .andWhere('p.refund_requested_at >= :from', {from: filter.from})
            .andWhere('p.refund_requested_at < :to', {to: filter.to});
        if (filter.store_id !== null) {
            query.andWhere('r.store_id = :store_id', {store_id: filter.store_id});
        }
        return query.groupBy('r.store_id').addGroupBy(REFUND_MONTH);
    }

    /**
     * 업체별 목록에 넣을 업체 — 지워지지 않은 업체
     *
     * @param where 조회 조건(업체 ID In — 활동 있는 업체, 빈 조건 — 모든 업체)
     * @returns 업체 목록
     */
    async findStatsStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]> {
        try {
            return await this.stores.find({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
```

### B. admin-service stats — Business Logic

```ts
// apps/admin-service/src/stats/stats.service.ts — 새 파일
import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {In} from 'typeorm';
import {dayjs} from '@app/common/utils/dayjs.js';
import {Pagination} from '@app/common/utils/pagination.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {StatsMineDto, StatsMineResultDto} from '@app/contracts/stats/dto/stats-mine.dto.js';
import type {StatsDto, StatsResultDto} from '@app/contracts/stats/dto/stats.dto.js';
import type {StatsRepositoryInterface} from './interfaces/stats.repository.interface.js';
import {STATS_ALL_STORES} from './stats.constants.js';
import {STATS_REPOSITORY} from './stats.symbols.js';
import {collectStatsStoreIds, resolveStatsPeriod, toStats} from './stats.util.js';

/**
 * 통계 service(admin-service) — 관리자 메인 화면의 이용자 수 · 이용 건수 · 결제액 · 환불액 · 수익(사용자 결정 2026-11-09).
 * 전체(총관리자 · 관리자 — 업체별 목록 포함) · 내 업체(업체 관리자). 읽기만이라 @Transactional 없음.
 */
@Injectable()
export class StatsService {
    /**
     * @param statsRepository 통계 repository 포트
     */
    constructor(@Inject(STATS_REPOSITORY) private readonly statsRepository: StatsRepositoryInterface) {}

    /**
     * 전체 통계 — 합계 · 월별 · 업체별(기본 활동 있는 업체, has_activity 0 이면 모든 업체 — 수익 내림차순 · 페이지). (내부 HTTP: GET /internal/v1/admin-service/stats)
     *
     * @param dto 월 기간 · 결제 환경 · 업체 범위 · 페이지
     * @returns 전체 통계
     */
    async getStats(dto: StatsDto): Promise<StatsResultDto> {
        // 1. 기간 — 시작 > 끝 · 12개월 초과는 입력 필드 오류
        const period = resolveStatsPeriod(dto.start_month, dto.end_month, dayjs());
        if (typeof period === 'string') {
            throw new BadRequestException({message: period, validation_errors: createValidationError('start_month', period)});
        }

        // 2. 집계 — 이용(업체 · 달 · 전체) · 결제 · 환불
        const filter = {from: period.from, to: period.to, environment: dto.environment, store_id: null};
        const usage = await this.statsRepository.findUsageRows(filter);
        const payments = await this.statsRepository.findPaymentRows(filter);
        const refunds = await this.statsRepository.findRefundRows(filter);

        // 3. 목록에 넣을 업체 — 모든 업체 또는 활동 있는 업체(없으면 조회 없이 빈 목록)
        const ids = collectStatsStoreIds(usage, payments, refunds);
        const stores =
            dto.has_activity === STATS_ALL_STORES ? await this.statsRepository.findStatsStores({}) : ids.length > 0 ? await this.statsRepository.findStatsStores({store_id: In(ids)}) : [];

        // 4. 모으기 → 업체별은 계산한 목록을 페이지로 자른다
        const stats = toStats(period.months, usage, payments, refunds, stores);
        const pagination = new Pagination({...dto, total_count: stats.stores.length});
        return {
            period: {start_month: period.start_month, end_month: period.end_month, environment: dto.environment},
            total: stats.total,
            monthly: stats.monthly,
            stores: {list: stats.stores.slice(pagination.offset, pagination.offset + pagination.limit), pagination: pagination.getPagination()},
        };
    }

    /**
     * 내 업체 통계 — 로그인 업체 관리자의 소속 업체만 합계 · 월별. (내부 HTTP: GET /internal/v1/admin-service/stats/mine)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 월 기간 · 결제 환경
     * @returns 내 업체 통계
     */
    async getMyStats(user_id: string, dto: StatsMineDto): Promise<StatsMineResultDto> {
        // 1. 소속 업체
        const store = await this.statsRepository.findManagerStore(user_id);
        if (!store) {
            throw new NotFoundException({message: '소속 업체를 찾을 수 없습니다.'});
        }

        // 2. 기간
        const period = resolveStatsPeriod(dto.start_month, dto.end_month, dayjs());
        if (typeof period === 'string') {
            throw new BadRequestException({message: period, validation_errors: createValidationError('start_month', period)});
        }

        // 3. 집계 — 그 업체만
        const filter = {from: period.from, to: period.to, environment: dto.environment, store_id: store.store_id};
        const usage = await this.statsRepository.findUsageRows(filter);
        const payments = await this.statsRepository.findPaymentRows(filter);
        const refunds = await this.statsRepository.findRefundRows(filter);
        const stats = toStats(period.months, usage, payments, refunds, [store]);
        return {
            period: {start_month: period.start_month, end_month: period.end_month, environment: dto.environment},
            store: {store_id: store.store_id, store_name: store.store_name},
            total: stats.total,
            monthly: stats.monthly,
        };
    }
}
```

### B. admin-service stats — Entry Point · Module

```ts
// apps/admin-service/src/stats/controllers/stats.controller.ts — 새 파일
import {Controller, Get, HttpCode, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {StatsMineDto, StatsMineResultDto} from '@app/contracts/stats/dto/stats-mine.dto.js';
import {StatsDto, StatsResultDto} from '@app/contracts/stats/dto/stats.dto.js';
import {StatsService} from '../stats.service.js';

/**
 * 통계 내부 HTTP 컨트롤러(동기 경로 인바운드 어댑터) — 조회만이라 큐 컨트롤러가 없다. 가드는 게이트웨이(전체 = 관리자, 내 업체 = 매니저).
 */
@Controller('/internal/v1/admin-service/stats')
export class StatsController {
    /**
     * @param statsService 통계 service
     */
    constructor(private readonly statsService: StatsService) {}

    /**
     * 전체 통계 (총관리자 · 관리자)
     */
    @Get('/')
    @HttpCode(200)
    async getStats(@Query() query: StatsDto): Promise<StatsResultDto> {
        const dto = new StatsDto(query);
        return this.statsService.getStats(dto);
    }

    /**
     * 내 업체 통계 (업체 총관리자 · 업체 관리자)
     */
    @Get('/mine')
    @HttpCode(200)
    async getMyStats(@InternalActor('user_id') user_id: string, @Query() query: StatsMineDto): Promise<StatsMineResultDto> {
        const dto = new StatsMineDto(query);
        return this.statsService.getMyStats(user_id, dto);
    }
}
```

```ts
// apps/admin-service/src/stats/stats.module.ts — 새 파일
import {Module} from '@nestjs/common';
import {StatsController} from './controllers/stats.controller.js';
import {StatsRepository} from './repositories/stats.repository.js';
import {STATS_REPOSITORY} from './stats.symbols.js';
import {StatsService} from './stats.service.js';

/**
 * 통계 도메인(admin-service — 총관리자 · 관리자 전체, 업체 관리자 내 업체) — 조회만이라 내부 HTTP 컨트롤러 하나.
 */
@Module({
    controllers: [StatsController],
    providers: [StatsService, {provide: STATS_REPOSITORY, useClass: StatsRepository}],
})
export class StatsModule {}
```

```ts
// apps/admin-service/src/admin-service.module.ts — import · imports 추가(UserModule 뒤), 주석 도메인 목록에 "stats(통계 — 전체 · 내 업체)"
import {StatsModule} from './stats/stats.module.js';
// …
        UserModule,
        StatsModule,
```

### C. gateway

```ts
// apps/gateway/src/api/v1/admin-service/stats/controllers/stats.controller.ts — 새 파일
import {Controller, Get, HttpCode, Query, UseGuards} from '@nestjs/common';
import {ApiBadRequestResponse, ApiBearerAuth, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {StatsMineDto, StatsMineResultDto} from '@app/contracts/stats/dto/stats-mine.dto.js';
import {StatsDto, StatsResultDto} from '@app/contracts/stats/dto/stats.dto.js';
import {STATS_INTERNAL_PATH} from '@app/contracts/stats/stats.commands.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 통계 공개 API — 동기 경로(내부 HTTP → admin-service stats). 전체는 관리자 가드, 내 업체는 매니저 가드. 조회만이라 큐 컨트롤러가 없다.
 */
@ApiTags('통계')
@Controller('/api/v1/admin-service/stats')
export class StatsController {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 전체 통계 (총관리자 · 관리자) — 월 기간(기본 최근 3개월) · 결제 환경 · 업체 범위, 합계 · 월별 · 업체별
     */
    @Get('/')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '전체 통계'})
    @ApiOkResponse({type: StatsResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStats(@PassportActor() actor: Actor, @Query() query: StatsDto): Promise<StatsResultDto> {
        const dto = new StatsDto(query);
        return this.internalHttp.request<StatsResultDto>('admin', 'GET', STATS_INTERNAL_PATH.ALL, {actor, query: dto});
    }

    /**
     * 내 업체 통계 (업체 총관리자 · 업체 관리자) — 월 기간 · 결제 환경, 합계 · 월별
     */
    @Get('/mine')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 통계'})
    @ApiOkResponse({type: StatsMineResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyStats(@PassportActor() actor: Actor, @Query() query: StatsMineDto): Promise<StatsMineResultDto> {
        const dto = new StatsMineDto(query);
        return this.internalHttp.request<StatsMineResultDto>('admin', 'GET', STATS_INTERNAL_PATH.MINE, {actor, query: dto});
    }
}
```

```ts
// apps/gateway/src/api/v1/admin-service/stats/stats.module.ts — 새 파일
import {Module} from '@nestjs/common';
import {StatsController} from './controllers/stats.controller.js';

/**
 * 게이트웨이 통계 라우트 — `/api/v1/admin-service/stats`(전체 — 관리자 가드, /mine — 매니저 가드). 조회만이라 동기 컨트롤러 하나. 전달 수단(TransportModule)은 전역이다.
 */
@Module({controllers: [StatsController]})
export class StatsModule {}
```

```ts
// apps/gateway/src/gateway.module.ts — import · imports 추가(AdminUserModule 뒤), 주석에 "통계 라우트: StatsModule(/api/v1/admin-service/stats — 관리자 · 매니저 가드)"
import {StatsModule} from './api/v1/admin-service/stats/stats.module.js';
// imports: […, AdminUserModule, StatsModule]
```

### D. 문서

- README: admin-service 설명에 통계(`/api/v1/admin-service/stats` — 총관리자 · 관리자 전체 · 업체별, `/stats/mine` — 업체 관리자 자기 업체, 월 기간 · 결제 환경), gateway 공개 경로 목록에 `/api/v1/admin-service/stats`.
- AGENTS.md: Architecture 트리(admin-service `stats/` · gateway admin-service 라우트 목록에 stats), Testing Smoke 목록(stats.repository — GROUPING SETS · 집계 · 매니저 소속 업체 · 업체 find 조건).
- docs/architecture.md: admin-service 도메인 목록 · 게이트웨이 트리 · 라우트 표에 stats.
- docs/testing.md: Smoke 목록 갱신.

---

## Test Cases

```
[CASES:stats-period] 입력 없음 · 지금 2026-11-09(한국) → 2026-09 ~ 2026-11, 월 [2026-09, 2026-10, 2026-11], 기간 [2026-09-01 00:00, 2026-12-01 00:00) 한국
[CASES:stats-period] 끝만 2026-06 → 2026-04 ~ 2026-06
[CASES:stats-period] 시작만 2026-01 · 지금 2026-11 → 2026-01 ~ 2026-11(11개월)
[CASES:stats-period] 2025-11 ~ 2026-02(연도 넘김) → 월 4개 [2025-11, 2025-12, 2026-01, 2026-02]
[CASES:stats-period] 2025-12 ~ 2026-11(12개월 — 경계) → 통과
[CASES:stats-period] 2025-11 ~ 2026-11(13개월) → 400 '기간은 최대 12개월입니다.'
[CASES:stats-period] 2026-03 ~ 2026-01(시작 > 끝) → 400 '시작 월이 끝 월보다 늦습니다.'
[CASES:stats-period] 같은 달 2026-11 ~ 2026-11 → 월 1개
[CASES:stats-aggregate] 집계 행 없음 → 합계 0, 월별은 기간의 모든 달 0, 업체 목록 빈 배열
[CASES:stats-aggregate] 한 업체 결제 30,000 · 환불 15,000 → 결제액 30,000 · 환불액 15,000 · 수익 15,000
[CASES:stats-aggregate] 업체 A 이용자 2 · 업체 B 이용자 2 · 전체(중복 제거) 3 → 합계 이용자 수 3, 업체별 2 · 2
[CASES:stats-aggregate] 10월만 활동 · 기간 9 ~ 11월 → 월별 9월 · 11월 0 채움, 오래된 달부터
[CASES:stats-aggregate] 업체 수익 다업체 10,000 · 나업체 30,000 · 가업체 30,000 → 가업체 · 나업체(같은 수익은 상호명 순) · 다업체
[CASES:stats-aggregate] 환불만 있는 업체(결제는 기간 밖) → 수익 음수 그대로
[CASES:stats-aggregate] 집계 값이 문자열('3' · '30000' — PostgreSQL count · sum) → 숫자로
[FAIL:validation] start_month 형식(2026-13 · 2026-1 · 202611) · environment 허용값 밖(REAL) · has_activity 허용값 밖(2) → 각 필드 오류
```

프로젝트 형태(spec 위치 · 단언):
- `apps/admin-service/src/stats/test/stats.spec.ts`(새, 동기 GET `/internal/v1/admin-service/stats`, `vi.useFakeTimers({toFake: ['Date']})` 2026-11-09 12:00 한국)
  - `[CASES:stats-period]` 8 — query → `findUsageRows` · `findPaymentRows` · `findRefundRows` 에 넘긴 필터(from · to · environment LIVE · store_id null)와 응답 `period` · `monthly` 달 목록. 400 두 줄은 `validation_errors.start_month` · 집계 조회 없음.
  - `[CASES:stats-aggregate]` 7 — repository 가 돌려준 집계 행 → 응답 `total` · `monthly` · `stores.list`(업체 조회 mock).
  - `[SUCCESS]` 업체 범위 — 기본(1): 활동 업체 ID 로 `findStatsStores({store_id: In([...])})`, 활동 없으면 조회 없음, `has_activity=0`: `findStatsStores({})` + 활동 없는 업체 0 으로 목록에. environment TEST 가 필터로. 업체 목록 페이지(size 1 · page 2 → 두 번째 업체, pagination.total_count = 업체 수).
  - `[FAIL:validation]` 5(월 형식 3 · 환경 · 범위), 내부 토큰 없음 403.
- `apps/admin-service/src/stats/test/stats-mine.spec.ts`(새, 동기 GET `/internal/v1/admin-service/stats/mine`) — `findManagerStore(user_id)` → 필터 `store_id` = 그 업체, 응답 `store` · `total` · `monthly`(업체 목록 없음), 소속 업체 없음 404(집계 조회 없음), 기간 400, `[FAIL:validation]` 환경.
- `apps/admin-service/src/stats/test/stats.repository.spec.ts`(새) — 통일 500(각 메서드), `findStatsStores` 조건에 `is_deleted: 0`, `[SMOKE:data-access]` `buildUsageQuery`(GROUPING SETS · GROUPING() · COUNT DISTINCT · 기본 구간 · 환경 · 업체 있음/없음 · 별칭 = StatsUsageRow 키) · `buildPaymentQuery` · `buildRefundQuery`(상태 IN · 시간대 달 · GROUP BY 업체 + 달 · 업체 있음/없음) · `buildManagerStoreQuery`(t_user 조인 · 탈퇴 제외).

테스트 생략(위임형): 게이트웨이 라우트 · 모듈 등록(admin-service 루트 · 게이트웨이 루트) · contracts 경로 상수 — 프로젝트 규칙상 gateway · controller spec 을 두지 않는다.

---

## Response Codes

| Entry | 200 | 400 | 401 | 404 | 503 | 500 |
|---|---|---|---|---|---|---|
| GET /api/v1/admin-service/stats | 기간 · 합계 · 월별 · 업체별 | 검증(월 형식 · 환경 · 범위) · 시작 > 끝 · 12개월 초과 | 관리자 아님 | — | 내부 HTTP | DB |
| GET /api/v1/admin-service/stats/mine | 기간 · 업체 · 합계 · 월별 | 검증 · 시작 > 끝 · 12개월 초과 | 매니저 아님 | 소속 업체 없음 | 내부 HTTP | DB |
