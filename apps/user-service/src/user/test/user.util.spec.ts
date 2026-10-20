import {randomInt} from 'node:crypto';
import {sha256Hex} from '@app/common/utils/hash.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import {buildSmsVerification, checkSmsVerification, generateTemporaryPassword, generateVerificationCode, getSmsDailyLimit, kstDayStart} from '../user.util.js';
import {ID_PATTERN} from './user.test-helper.js';

/** randomInt — 기본은 실제 함수, 강제 케이스만 mockReturnValueOnce 로 바꾼다 */
vi.mock('node:crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:crypto')>();
    return {...actual, randomInt: vi.fn(actual.randomInt)};
});

/**
 * 인증 기록 — 케이스마다 상태 컬럼만 바꾼다.
 *
 * @param fields verified_at · expires_at
 * @returns 인증 기록
 */
function verification(fields: {verified_at: Date | null; expires_at: Date}): SmsVerificationEntity {
    const entity = new SmsVerificationEntity();
    entity.verified_at = fields.verified_at;
    entity.expires_at = fields.expires_at;
    return entity;
}

describe('[CASES:kstDayStart] 한국 날짜 0시', () => {
    it.each([
        ['2026-10-19T15:00:00.000Z', '2026-10-19T15:00:00.000Z', 'KST 10-20 00:00 은 그 자신'],
        ['2026-10-20T14:59:59.999Z', '2026-10-19T15:00:00.000Z', 'KST 10-20 23:59:59.999 는 같은 날'],
        ['2026-10-20T15:00:00.000Z', '2026-10-20T15:00:00.000Z', 'KST 10-21 00:00 은 다음 날'],
        ['2026-10-20T03:00:00.000Z', '2026-10-19T15:00:00.000Z', 'KST 10-20 12:00 은 같은 날'],
    ])('%s → %s (%s)', (now, expected) => {
        expect(kstDayStart(new Date(now)).toISOString()).toBe(expected);
    });
});

describe('[CASES:getSmsDailyLimit] 하루 발송 한도 env', () => {
    const saved = process.env.SMS_VERIFICATION_DAILY_LIMIT;

    afterEach(() => {
        if (saved === undefined) {
            delete process.env.SMS_VERIFICATION_DAILY_LIMIT;
        } else {
            process.env.SMS_VERIFICATION_DAILY_LIMIT = saved;
        }
    });

    it('없으면 10', () => {
        delete process.env.SMS_VERIFICATION_DAILY_LIMIT;

        expect(getSmsDailyLimit()).toBe(10);
    });

    it.each([
        ['5', 5],
        ['abc', 10],
        ['0', 10],
        ['-3', 10],
    ])('%j → %i', (value, expected) => {
        process.env.SMS_VERIFICATION_DAILY_LIMIT = value;

        expect(getSmsDailyLimit()).toBe(expected);
    });
});

describe('[CASES:checkSmsVerification] 인증 기록 상태', () => {
    const now = new Date('2026-10-20T00:00:00.000Z');

    it('verified_at 이 있으면 만료 전이어도 USED', () => {
        expect(checkSmsVerification(verification({verified_at: new Date('2026-10-19T23:59:00.000Z'), expires_at: new Date('2026-10-20T00:05:00.000Z')}), now)).toBe('USED');
    });

    it('expires_at == now 이면 EXPIRED (같으면 만료)', () => {
        expect(checkSmsVerification(verification({verified_at: null, expires_at: now}), now)).toBe('EXPIRED');
    });

    it('expires_at < now 이면 EXPIRED', () => {
        expect(checkSmsVerification(verification({verified_at: null, expires_at: new Date('2026-10-19T23:59:59.999Z')}), now)).toBe('EXPIRED');
    });

    it('미인증 · 만료 전이면 USABLE', () => {
        expect(checkSmsVerification(verification({verified_at: null, expires_at: new Date('2026-10-20T00:00:00.001Z')}), now)).toBe('USABLE');
    });
});

describe('[CASES:generateVerificationCode] 인증번호 6자리', () => {
    it('200회 모두 숫자 6자리', () => {
        for (let i = 0; i < 200; i++) {
            expect(generateVerificationCode()).toMatch(/^\d{6}$/);
        }
    });

    it('난수가 42 면 앞자리 0 을 유지해 000042', () => {
        vi.mocked(randomInt).mockReturnValueOnce(42 as never);

        expect(generateVerificationCode()).toBe('000042');
    });
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

describe('[CASES:buildSmsVerification] 발송 기록', () => {
    it('인증번호는 해시로만, 만료는 발송 + 5분, 빈 IP 는 null', () => {
        const now = new Date('2026-10-20T00:00:00.000Z');

        const entity = buildSmsVerification({sms_purpose_id: 'PHONE_VERIFY', user_id: 'u'.repeat(32), phone: '01012345678', code: '123456', ip: '', now});

        expect(entity).toBeInstanceOf(SmsVerificationEntity);
        expect(entity.sms_verification_id).toMatch(ID_PATTERN);
        expect(entity).toEqual({
            sms_verification_id: entity.sms_verification_id,
            sms_purpose_id: 'PHONE_VERIFY',
            user_id: 'u'.repeat(32),
            phone: '01012345678',
            code_hash: sha256Hex('123456'),
            attempt_count: 0,
            expires_at: new Date('2026-10-20T00:05:00.000Z'),
            verified_at: null,
            ip: null,
        });
    });
});
