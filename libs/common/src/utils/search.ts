/**
 * 검색어를 부분 일치 패턴으로 — `%` · `_` · `\` 는 글자 그대로 찾도록 이스케이프한다(PostgreSQL 기본 이스케이프 문자 `\`).
 *
 * @param keyword 검색어
 * @returns ILike 패턴
 */
export function toContainsPattern(keyword: string): string {
    return `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
