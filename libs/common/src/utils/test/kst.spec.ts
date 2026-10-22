import {kstDayStart, kstYear} from '../kst.js';

describe('[CASES:kstDayStart] 한국 날짜 0시', () => {
    it.each([
        ['2026-10-19T15:00:00.000Z', '2026-10-19T15:00:00.000Z', 'KST 10-20 00:00 은 그 자신'],
        ['2026-10-20T14:59:59.999Z', '2026-10-19T15:00:00.000Z', 'KST 10-20 23:59:59.999 는 같은 날'],
        ['2026-10-20T15:00:00.000Z', '2026-10-20T15:00:00.000Z', 'KST 10-21 00:00 은 다음 날'],
        ['2026-10-20T03:00:00.000Z', '2026-10-19T15:00:00.000Z', 'KST 10-20 12:00 은 같은 날'],
    ])('%s → %s (%s)', (now, expected) => {
        expect(kstDayStart(new Date(now)).toISOString()).toBe(expected);
    });
});

describe('[CASES:kstYear] 한국 연도', () => {
    it.each([
        ['2026-12-31T14:59:59.000Z', 2026, 'KST 2026-12-31 23:59:59 는 아직 2026'],
        ['2026-12-31T15:00:00.000Z', 2027, 'KST 2027-01-01 00:00 은 2027'],
    ])('%s → %i (%s)', (now, expected) => {
        expect(kstYear(new Date(now))).toBe(expected);
    });
});
