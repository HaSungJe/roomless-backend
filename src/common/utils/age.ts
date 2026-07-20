import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

/**
 * 생년월일(YYYY-MM-DD) → 만나이 정수. 빈값/형식·날짜 오류 시 null.
 * strict 파싱(customParseFormat)으로 '2000-13-40' 같은 잘못된 날짜 차단. diff 'year' = 생일 안 지났으면 1 적음(만나이).
 */
export function ageFromBirth(birth: string | null | undefined): number | null {
    if (!birth) return null;
    const d = dayjs(birth, 'YYYY-MM-DD', true);
    if (!d.isValid()) return null;
    return dayjs().diff(d, 'year');
}
