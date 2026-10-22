/** 한국 표준시 오프셋(ms) — 서머타임 없음 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 그 시각이 속한 한국 날짜의 0시(KST) — 같은 번호 하루 발송 수를 세는 시작점.
 *
 * @param now 기준 시각
 * @returns 한국 날짜 0시의 Date
 */
export function kstDayStart(now: Date): Date {
    const kst = new Date(now.getTime() + KST_OFFSET_MS);
    kst.setUTCHours(0, 0, 0, 0);
    return new Date(kst.getTime() - KST_OFFSET_MS);
}

/**
 * 그 시각의 한국 연도 — 연 단위 나이(청소년보호법) 계산에 쓴다.
 *
 * @param now 기준 시각
 * @returns 한국 날짜 기준 연도
 */
export function kstYear(now: Date): number {
    return new Date(now.getTime() + KST_OFFSET_MS).getUTCFullYear();
}
