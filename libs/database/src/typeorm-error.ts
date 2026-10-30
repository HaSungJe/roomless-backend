import {QueryFailedError} from 'typeorm';

/** PostgreSQL 오류 코드 — 23505: UNIQUE 위반, 23503: FOREIGN KEY 위반, 23P01: EXCLUDE(배타 제약) 위반 */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_EXCLUSION_VIOLATION = '23P01';

/**
 * TypeORM 오류에서 PostgreSQL 드라이버 오류(code · constraint)를 꺼낸다.
 *
 * @param error catch 로 잡은 값
 * @returns 드라이버 오류 또는 null
 */
function driverErrorOf(error: unknown): {code?: string; constraint?: string} | null {
    if (!(error instanceof QueryFailedError)) return null;
    return (error.driverError as {code?: string; constraint?: string} | undefined) ?? null;
}

/**
 * 특정 UK 제약 위반인지 — repository 의 "제약명별 if 분기" 에 쓴다.
 *
 * @param error catch 로 잡은 값
 * @param constraint 제약명 (예: 'UK_User_LoginId')
 * @returns 해당 UK 위반이면 true
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
    const driverError = driverErrorOf(error);
    return driverError?.code === PG_UNIQUE_VIOLATION && driverError.constraint === constraint;
}

/**
 * 특정 FK 제약 위반인지 — repository 의 "제약명별 if 분기" 에 쓴다.
 *
 * @param error catch 로 잡은 값
 * @param constraint 제약명 (예: 'FK_User_Auth')
 * @returns 해당 FK 위반이면 true
 */
export function isForeignKeyViolation(error: unknown, constraint: string): boolean {
    const driverError = driverErrorOf(error);
    return driverError?.code === PG_FOREIGN_KEY_VIOLATION && driverError.constraint === constraint;
}

/**
 * 특정 배타 제약(EXC_ — 범위 겹침) 위반인지 — repository 의 "제약명별 if 분기" 에 쓴다.
 *
 * @param error catch 로 잡은 값
 * @param constraint 제약명 (예: 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange')
 * @returns 해당 배타 제약 위반이면 true
 */
export function isExclusionViolation(error: unknown, constraint: string): boolean {
    const driverError = driverErrorOf(error);
    return driverError?.code === PG_EXCLUSION_VIOLATION && driverError.constraint === constraint;
}
