import {BadRequestException} from '@nestjs/common';
import {ValidationError} from 'class-validator';
import {ValidationErrorResultDto} from '@app/common/dto/global.result.dto.js';
import {createValidationError, toValidationErrorResultDto, VALIDATION_FALLBACK_MESSAGE, validationExceptionFactory} from '@app/common/utils/validation.js';

/**
 * 테스트용 class-validator 오류를 만든다.
 *
 * @param property 필드명
 * @param constraints 제약 → 메시지
 * @param contexts 제약별 context
 * @returns ValidationError
 */
function makeError(property: string, constraints: Record<string, string>, contexts?: Record<string, any>): ValidationError {
    const error = new ValidationError();
    error.property = property;
    error.constraints = constraints;
    error.contexts = contexts;
    return error;
}

describe('validationExceptionFactory', () => {
    it('[SUCCESS] 오류 목록을 {message, validation_errors} 본문의 400 으로 만든다 — message 는 첫 오류', () => {
        const exception = validationExceptionFactory([makeError('login_id', {isNotEmpty: '로그인 ID를 입력해주세요.'}), makeError('nickname', {maxLength: '닉네임은 50자 이하로 입력해주세요.'})]);

        expect(exception).toBeInstanceOf(BadRequestException);
        expect(exception.getStatus()).toBe(400);
        expect(exception.getResponse()).toEqual({
            message: '로그인 ID를 입력해주세요.',
            validation_errors: [
                {property: 'login_id', message: '로그인 ID를 입력해주세요.'},
                {property: 'nickname', message: '닉네임은 50자 이하로 입력해주세요.'},
            ],
        });
    });

    it('[FAIL:empty] 오류가 없으면 기본 메시지와 빈 배열', () => {
        expect(validationExceptionFactory([]).getResponse()).toEqual({message: VALIDATION_FALLBACK_MESSAGE, validation_errors: []});
    });
});

describe('toValidationErrorResultDto', () => {
    it('isBoolean 에 context.target 이 있으면 그 값을 대상 필드로 쓴다', () => {
        const dto = toValidationErrorResultDto(makeError('agree', {isBoolean: '약관에 동의해주세요.'}, {isBoolean: {target: 'terms_agree'}}));

        expect(dto).toBeInstanceOf(ValidationErrorResultDto);
        expect(dto).toEqual({property: 'terms_agree', message: '약관에 동의해주세요.'});
    });

    it('constraints 가 없으면 기본 메시지', () => {
        const error = new ValidationError();
        error.property = 'x';

        expect(toValidationErrorResultDto(error)).toEqual({property: 'x', message: '실패했습니다.'});
    });
});

describe('createValidationError', () => {
    it('입력 필드 귀속 오류 1건을 만든다', () => {
        expect(createValidationError('birth', '생년월일을 확인해주세요.')).toEqual([{property: 'birth', message: '생년월일을 확인해주세요.'}]);
    });
});
