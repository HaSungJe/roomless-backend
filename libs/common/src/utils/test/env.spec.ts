import {readPositiveInt} from '@app/common/utils/env.js';

describe('[CASES:readPositiveInt] 양의 정수 환경변수 — 없거나 잘못된 값이면 기본값', () => {
    it.each([
        ['5000', 5000],
        [undefined, 30000],
        ['abc', 30000],
        ['-1', 30000],
        ['0', 30000],
    ])('readPositiveInt(%s) = %i', (value, expected) => {
        expect(readPositiveInt(value, 30000)).toBe(expected);
    });
});
