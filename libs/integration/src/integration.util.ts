/**
 * 국내 휴대폰 번호를 E.164 로 바꾼다 — `010-1234-5678` · `01012345678` → `+821012345678`.
 * 이미 `+` 로 시작하면 국가번호가 붙은 것으로 보고 숫자만 남긴다. 번호 형식 검증은 입력 DTO 몫이다.
 *
 * @param phone 휴대폰 번호
 * @returns E.164 번호
 */
export function toE164KrPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (phone.trim().startsWith('+')) {
        return `+${digits}`;
    }
    return `+82${digits.replace(/^0/, '')}`;
}
