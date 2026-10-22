import {randomInt} from 'node:crypto';
import {generateTemporaryPassword} from '../password.js';

/** randomInt — 기본은 실제 함수, 강제 케이스만 mockReturnValueOnce 로 바꾼다 */
vi.mock('node:crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:crypto')>();
    return {...actual, randomInt: vi.fn(actual.randomInt)};
});

describe('[CASES:generateTemporaryPassword] 임시 비밀번호', () => {
    it('200회 모두 영문 + 숫자 10자리, 영문 · 숫자가 각각 1자 이상', () => {
        for (let i = 0; i < 200; i++) {
            const password = generateTemporaryPassword();
            expect(password).toMatch(/^[A-Za-z0-9]{10}$/);
            expect(password).toMatch(/[A-Za-z]/);
            expect(password).toMatch(/\d/);
        }
    });

    it('처음 10자가 숫자만 나오면 다시 뽑는다', () => {
        // 문자 표의 52번째부터가 숫자('0' ~ '9') — 첫 10번을 모두 숫자 인덱스로
        vi.mocked(randomInt).mockClear();
        for (let i = 0; i < 10; i++) {
            vi.mocked(randomInt).mockReturnValueOnce(52 as never);
        }

        const password = generateTemporaryPassword();

        expect(password).toMatch(/[A-Za-z]/);
        expect(password).toMatch(/\d/);
        expect(vi.mocked(randomInt).mock.calls.length).toBeGreaterThanOrEqual(20);
    });
});
