import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';

/** 문 시각 형식 — 한국 시각 yyyyMMddHHmmss (Redis 문 정보의 시각 칸) */
const DOOR_TIME_FORMAT = 'YYYYMMDDHHmmss';

/**
 * 문을 열거나 닫은 시각 — 한국 시각 `yyyyMMddHHmmss`(밀리초는 버린다).
 *
 * @param at 시각
 * @returns 예: 20261101022459
 */
export function toDoorTime(at: Date): string {
    return dayjs(at).tz(KST_TIMEZONE).format(DOOR_TIME_FORMAT);
}
