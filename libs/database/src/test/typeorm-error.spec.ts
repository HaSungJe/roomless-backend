import {QueryFailedError} from 'typeorm';
import {isForeignKeyViolation, isUniqueViolation} from '@app/database/typeorm-error.js';

/**
 * PostgreSQL 드라이버 오류를 감싼 QueryFailedError.
 *
 * @param code PostgreSQL 오류 코드
 * @param constraint 제약명
 * @returns QueryFailedError
 */
function queryFailed(code: string, constraint?: string): QueryFailedError {
    return new QueryFailedError('SQL', [], Object.assign(new Error('pg error'), {code, constraint}));
}

describe('typeorm-error — 제약명별 위반 판별', () => {
    describe('isUniqueViolation', () => {
        it('[SUCCESS] 23505 + 같은 제약명이면 true', () => {
            expect(isUniqueViolation(queryFailed('23505', 'UK_User_LoginId'), 'UK_User_LoginId')).toBe(true);
        });

        it.each([
            ['다른 제약명', queryFailed('23505', 'UK_User_UserSearchCode')],
            ['FK 위반 코드', queryFailed('23503', 'UK_User_LoginId')],
            ['제약명 없음', queryFailed('23505')],
            ['QueryFailedError 가 아님', new Error('UK_User_LoginId')],
            ['null', null],
        ])('[FAIL] %s → false', (_label, error) => {
            expect(isUniqueViolation(error, 'UK_User_LoginId')).toBe(false);
        });
    });

    describe('isForeignKeyViolation', () => {
        it('[SUCCESS] 23503 + 같은 제약명이면 true', () => {
            expect(isForeignKeyViolation(queryFailed('23503', 'FK_User_Auth'), 'FK_User_Auth')).toBe(true);
        });

        it('[FAIL] UK 위반 코드 · 다른 제약명이면 false', () => {
            expect(isForeignKeyViolation(queryFailed('23505', 'FK_User_Auth'), 'FK_User_Auth')).toBe(false);
            expect(isForeignKeyViolation(queryFailed('23503', 'FK_User_State'), 'FK_User_Auth')).toBe(false);
        });
    });
});
