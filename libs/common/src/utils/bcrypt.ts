import bcrypt from 'bcrypt';

/** BCRYPT_ROUNDS 가 없을 때 쓰는 라운드(cost) */
export const DEFAULT_BCRYPT_ROUNDS = 12;

/**
 * 해시 라운드(cost)를 환경변수 BCRYPT_ROUNDS 에서 읽는다(허용 범위 4~31 은 .env 주석으로 안내). 없으면 기본값(12).
 * 라운드는 해시 문자열($2b$<cost>$…)에 기록되므로 값을 바꿔도 기존 해시 검증은 그대로 된다.
 *
 * @returns 라운드
 */
export function getBcryptRounds(): number {
    return parseInt(process.env.BCRYPT_ROUNDS || String(DEFAULT_BCRYPT_ROUNDS));
}

/**
 * Bcrypt 해시 — 환경변수 BCRYPT_CODE 를 앞에 붙여(pepper) BCRYPT_ROUNDS 라운드로 해시한다.
 *
 * @param str 원문
 * @returns 해시
 */
export async function getBcrypt(str: string): Promise<string> {
    return bcrypt.hash((process.env.BCRYPT_CODE ?? '') + str, getBcryptRounds());
}

/**
 * Bcrypt 비교 — 인자 순서가 뒤바뀌어 호출돼도 맞도록 양방향으로 비교한다.
 *
 * @param strA 원문 또는 해시
 * @param strB 해시 또는 원문
 * @returns 일치하면 true
 */
export async function matchBcrypt(strA: string, strB: string): Promise<boolean> {
    const pepper = process.env.BCRYPT_CODE ?? '';
    const match1 = await bcrypt.compare(pepper + strA, strB);
    const match2 = await bcrypt.compare(pepper + strB, strA);
    return match1 || match2;
}
