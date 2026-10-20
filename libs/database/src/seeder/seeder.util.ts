/**
 * 확인 컬럼(PK 또는 유일 컬럼) 기준으로 아직 DB 에 없는 행만 골라낸다 (멱등 시드용 순수함수).
 *
 * @param rows 기본 데이터 전체(SEED_DATA)
 * @param existing 현재 DB 에 존재하는 행 목록(같은 확인 컬럼 보유)
 * @param key 확인 컬럼 프로퍼티명
 * @returns existing 에 그 값이 없는 rows 의 부분집합
 */
export function pickMissingRows<T>(rows: T[], existing: T[], key: string): T[] {
    const existingValues = new Set(existing.map((e) => (e as Record<string, unknown>)[key]));
    return rows.filter((r) => !existingValues.has((r as Record<string, unknown>)[key]));
}
