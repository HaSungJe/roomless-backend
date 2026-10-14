import {BadRequestException, ForbiddenException, HttpException, HttpStatus, NotFoundException} from '@nestjs/common';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import {createFailBody, normalizeFailBody, PAYLOAD_TOO_LARGE_MESSAGE, toFailResult, UNHANDLED_FAIL_MESSAGE} from '@app/common/utils/fail-result.js';
import {createValidationError} from '@app/common/utils/validation.js';

describe('toFailResult', () => {
    describe('[SUCCESS] HttpException 정규화', () => {
        it('service 가 던진 {message} 는 상태 코드를 유지하고 validation_errors 를 null 로 채운다', () => {
            const result = toFailResult(new NotFoundException({message: '회원을 찾을 수 없습니다.'}));

            expect(result.status_code).toBe(404);
            expect(result.body).toBeInstanceOf(ApiFailResultDto);
            expect(result.body).toEqual({message: '회원을 찾을 수 없습니다.', validation_errors: null});
        });

        it('입력 필드 귀속 오류는 validation_errors 를 그대로 싣는다', () => {
            const message = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';
            const result = toFailResult(new BadRequestException({message, validation_errors: createValidationError('birth', message)}));

            expect(result.status_code).toBe(400);
            expect(result.body).toEqual({message, validation_errors: [{property: 'birth', message}]});
        });

        it('service 가 넣은 추가 필드는 보존한다 — 정지 계정 로그인의 block_comment', () => {
            const result = toFailResult(new HttpException({message: '이용이 제한된 계정입니다.', block_comment: '운영정책 위반'}, HttpStatus.FORBIDDEN));

            expect(result.status_code).toBe(403);
            expect(result.body).toEqual({message: '이용이 제한된 계정입니다.', validation_errors: null, block_comment: '운영정책 위반'});
        });

        it('Nest 기본 예외의 statusCode · error 는 상태 코드와 중복이라 버린다', () => {
            const result = toFailResult(new NotFoundException());

            expect(result.status_code).toBe(404);
            expect(result.body).toEqual({message: 'Not Found', validation_errors: null});
        });

        it('문자열 response 는 메시지로 쓴다', () => {
            const result = toFailResult(new HttpException('이미 처리된 요청입니다.', HttpStatus.CONFLICT));

            expect(result.status_code).toBe(409);
            expect(result.body).toEqual({message: '이미 처리된 요청입니다.', validation_errors: null});
        });

        it('message 가 배열이면 첫 항목을 쓴다', () => {
            const result = toFailResult(new BadRequestException({message: ['첫 번째 오류', '두 번째 오류']}));

            expect(result.body).toEqual({message: '첫 번째 오류', validation_errors: null});
        });

        it('response 에 message 가 없으면 예외 메시지로 대체한다', () => {
            const result = toFailResult(new ForbiddenException({}));

            expect(result.status_code).toBe(403);
            expect(result.body.message).toBe('Forbidden Exception');
            expect(result.body.validation_errors).toBeNull();
        });
    });

    describe('[FAIL:unhandled] HttpException 이 아닌 예외', () => {
        it('일반 Error 는 500 + 공통 메시지로 바꾸고 내부 메시지를 노출하지 않는다', () => {
            const result = toFailResult(new Error('Connection lost: mysql://user:pw@db'));

            expect(result.status_code).toBe(500);
            expect(result.body).toEqual({message: UNHANDLED_FAIL_MESSAGE, validation_errors: null});
            expect(result.body.message).toBe('요청이 실패했습니다. 관리자에게 문의해주세요.');
        });

        it('Error 가 아닌 값이 throw 돼도 500 으로 바꾼다', () => {
            expect(toFailResult('boom')).toEqual({status_code: 500, body: {message: UNHANDLED_FAIL_MESSAGE, validation_errors: null}});
            expect(toFailResult(undefined).status_code).toBe(500);
        });

        it('body-parser 크기 초과는 413', () => {
            const result = toFailResult(new Error('request entity too large'));

            expect(result.status_code).toBe(413);
            expect(result.body).toEqual({message: PAYLOAD_TOO_LARGE_MESSAGE, validation_errors: null});
            expect(result.body.message).toBe('한 요청당 제한된 크기를 초과하였습니다. [최대 15Mb]');
        });
    });
});

describe('normalizeFailBody · createFailBody', () => {
    it('validation_errors 가 배열이 아니면 null 로 바꾼다', () => {
        expect(normalizeFailBody({message: '실패', validation_errors: 'x'}, 'fallback')).toEqual({message: '실패', validation_errors: null});
    });

    it('createFailBody 는 두 필드를 모두 가진 ApiFailResultDto 인스턴스를 만든다', () => {
        const body = createFailBody('메시지', null);

        expect(body).toBeInstanceOf(ApiFailResultDto);
        expect(Object.keys(body)).toEqual(['message', 'validation_errors']);
    });
});
