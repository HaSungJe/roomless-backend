import {toE164KrPhone} from '@app/integration/integration.util.js';

describe('[CASES:toE164KrPhone] 국내 휴대폰 번호 → E.164', () => {
    it.each([
        ['01012345678', '+821012345678'],
        ['010-1234-5678', '+821012345678'],
        [' 010 1234 5678 ', '+821012345678'],
        ['+82 10-1234-5678', '+821012345678'],
        ['0111234567', '+82111234567'],
    ])('%j → %s', (phone, expected) => {
        expect(toE164KrPhone(phone)).toBe(expected);
    });
});
