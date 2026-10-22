/**
 * 양의 정수 환경변수를 읽는다. 없거나 잘못된 값이면 기본값.
 *
 * @param value 환경변수 값
 * @param fallback 기본값
 * @returns 정수
 */
export function readPositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
