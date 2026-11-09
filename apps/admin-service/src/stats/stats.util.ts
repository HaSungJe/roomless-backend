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
 * 파일 전용 — 'YYYY-MM' 을 그 달 1일로(달 계산용 — 서버 시간대와 무관하게 달만 센다).
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
    return {start_month: months[0], end_month: months[months.length - 1], months, from: toKstMonthStart(months[0]), to: toKstMonthStart(end.add(1, 'month').format(STATS_MONTH_FORMAT))};
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
 * 활동이 있는 업체 ID — 이용(업체별 행) · 결제 · 환불 행에 나온 업체(중복 없이, 처음 나온 순서).
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
export function toStats(
    months: string[],
    usage: StatsUsageRow[],
    payments: StatsAmountRow[],
    refunds: StatsAmountRow[],
    stores: Pick<StoreEntity, 'store_id' | 'store_name' | 'store_code' | 'store_state_id'>[],
): StatsAggregate {
    const total = emptySummary();
    const monthly = new Map<string, StatsMonthResultDto>(months.map((month) => [month, {month, ...emptySummary()}]));
    const byStore = new Map<string, StatsStoreResultDto>(
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

    return {total, monthly: [...monthly.values()], stores: [...byStore.values()].sort((a, b) => b.profit - a.profit || a.store_name.localeCompare(b.store_name, 'ko'))};
}
