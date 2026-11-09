import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';

/**
 * t_api_log 월 파티션 — 마이그레이션(처음 만들기)과 scheduler crontab(미리 만들기)이 같이 쓴다.
 * created_at RANGE, 경계는 한국 달 1일 00:00. 지우지 않는다(사용자 결정 2026-11-10 — 보관 기간 없음).
 */

/** 파티션을 미리 만들어 두는 달 수 — 이번 달 + 앞으로 3개월 */
export const API_LOG_AHEAD_MONTHS = 3;

/** 범위 밖 행을 받는 기본 파티션 — insert 가 실패하지 않게 */
export const API_LOG_DEFAULT_PARTITION = 't_api_log_default';

/** t_api_log 월 파티션 — 이름(`t_api_log_YYYYMM`) · 한국 달 경계 [from, to) (ISO, +09:00) */
export interface ApiLogPartition {
    name: string;
    from: string;
    to: string;
}

/**
 * 파일 전용 — 그 달 1일 00:00 한국 시각(ISO).
 *
 * @param month 그 달(1일)
 * @returns 시각
 */
function toKstMonthStart(month: Dayjs): string {
    return dayjs.tz(`${month.format('YYYY-MM')}-01 00:00`, 'YYYY-MM-DD HH:mm', KST_TIMEZONE).format();
}

/**
 * 만들 파티션 — 지금의 한국 달부터 ahead 개월 뒤까지(이번 달 포함 ahead + 1 개, 오래된 달부터).
 *
 * @param now 지금
 * @param ahead 앞으로 만들 달 수
 * @returns 파티션 목록
 */
export function buildApiLogPartitions(now: Dayjs, ahead: number): ApiLogPartition[] {
    const first = dayjs(`${now.tz(KST_TIMEZONE).format('YYYY-MM')}-01`, 'YYYY-MM-DD', true);
    return Array.from({length: ahead + 1}, (_, index) => {
        const month = first.add(index, 'month');
        return {name: `t_api_log_${month.format('YYYYMM')}`, from: toKstMonthStart(month), to: toKstMonthStart(month.add(1, 'month'))};
    });
}

/**
 * 파티션 만들기 DDL — 이미 있으면 그대로(IF NOT EXISTS). 값은 buildApiLogPartitions 가 만든 것만 받는다(바인딩 파라미터를 쓸 수 없는 DDL).
 *
 * @param partition 파티션
 * @returns SQL
 */
export function toCreateApiLogPartitionSql(partition: ApiLogPartition): string {
    return `CREATE TABLE IF NOT EXISTS "${partition.name}" PARTITION OF "t_api_log" FOR VALUES FROM ('${partition.from}') TO ('${partition.to}')`;
}
