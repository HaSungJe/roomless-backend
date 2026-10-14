import bcrypt from 'bcrypt';
import {DEFAULT_BCRYPT_ROUNDS, getBcrypt, getBcryptRounds, matchBcrypt} from '@app/common/utils/bcrypt.js';

describe('bcrypt util', () => {
    const original = {pepper: process.env.BCRYPT_CODE, rounds: process.env.BCRYPT_ROUNDS};

    beforeEach(() => {
        process.env.BCRYPT_CODE = 'pepper-';
        delete process.env.BCRYPT_ROUNDS;
    });

    afterAll(() => {
        process.env.BCRYPT_CODE = original.pepper;
        process.env.BCRYPT_ROUNDS = original.rounds;
    });

    describe('getBcryptRounds — 환경변수 BCRYPT_ROUNDS', () => {
        it('값이 있으면 그 라운드를 쓴다', () => {
            process.env.BCRYPT_ROUNDS = '10';

            expect(getBcryptRounds()).toBe(10);
        });

        it.each([[undefined], ['']])('값이 없으면(%s) 기본 12', (value) => {
            if (value === undefined) delete process.env.BCRYPT_ROUNDS;
            else process.env.BCRYPT_ROUNDS = value;

            expect(getBcryptRounds()).toBe(DEFAULT_BCRYPT_ROUNDS);
            expect(DEFAULT_BCRYPT_ROUNDS).toBe(12);
        });
    });

    describe('getBcrypt · matchBcrypt (실제 해시)', () => {
        it('[SUCCESS] BCRYPT_ROUNDS 라운드로 해시하고, 양방향 비교가 모두 일치한다', async () => {
            process.env.BCRYPT_ROUNDS = '12';

            const hash = await getBcrypt('abcd1234!');

            expect(hash).toMatch(/^\$2b\$12\$/);
            await expect(matchBcrypt('abcd1234!', hash)).resolves.toBe(true);
            await expect(matchBcrypt(hash, 'abcd1234!')).resolves.toBe(true);
        });

        it('[SUCCESS] 라운드를 바꾸면 새 해시에 반영된다', async () => {
            process.env.BCRYPT_ROUNDS = '4';

            await expect(getBcrypt('abcd1234!')).resolves.toMatch(/^\$2b\$04\$/);
        });

        it('[FAIL] 다른 비밀번호 · pepper 없는 해시는 불일치', async () => {
            process.env.BCRYPT_ROUNDS = '4';
            const hash = await getBcrypt('abcd1234!');
            const withoutPepper = await bcrypt.hash('abcd1234!', 4);

            await expect(matchBcrypt('wrong5678!', hash)).resolves.toBe(false);
            await expect(matchBcrypt('abcd1234!', withoutPepper)).resolves.toBe(false);
        });

        it('[COMPAT] 라운드가 다른 예전 해시(13)도 그대로 검증된다', async () => {
            process.env.BCRYPT_ROUNDS = '12';
            const legacy = await bcrypt.hash('pepper-abcd1234!', 13);

            await expect(matchBcrypt('abcd1234!', legacy)).resolves.toBe(true);
        });
    });
});
