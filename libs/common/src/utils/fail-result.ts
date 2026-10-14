import {HttpException, HttpStatus} from '@nestjs/common';
import {ApiFailResultDto, FailResult, ValidationErrorResultDto} from '@app/common/dto/global.result.dto.js';

/** 처리되지 않은 예외(버그·인프라 장애)의 공통 메시지 */
export const UNHANDLED_FAIL_MESSAGE = '요청이 실패했습니다. 관리자에게 문의해주세요.';

/** 요청 본문 크기 초과 메시지 */
export const PAYLOAD_TOO_LARGE_MESSAGE = '한 요청당 제한된 크기를 초과하였습니다. [최대 15Mb]';

/**
 * 어떤 예외든 전송 계층과 무관한 실패 결과로 바꾼다.
 *
 * - `HttpException`(service 가 던진 BadRequest/NotFound 등, ValidationPipe 오류): 상태 코드 유지, 본문을 `{message, validation_errors}` 로 정규화
 * - body-parser 의 크기 초과: 413
 * - 그 밖의 모든 예외: 500 + 공통 메시지 (내부 메시지·stack 은 노출하지 않음)
 *
 * HTTP 필터와 RabbitMQ 핸들러가 모두 이 함수를 쓴다 — service 는 어느 경로에서 호출됐는지 몰라도 된다.
 *
 * @param exception 잡힌 예외
 * @returns 상태 코드 + 실패 본문
 */
export function toFailResult(exception: unknown): FailResult {
    if (exception instanceof HttpException) {
        return {status_code: exception.getStatus(), body: normalizeFailBody(exception.getResponse(), exception.message)};
    }

    if (exception instanceof Error && exception.message.includes('request entity too large')) {
        return {status_code: HttpStatus.PAYLOAD_TOO_LARGE, body: createFailBody(PAYLOAD_TOO_LARGE_MESSAGE, null)};
    }

    return {status_code: HttpStatus.INTERNAL_SERVER_ERROR, body: createFailBody(UNHANDLED_FAIL_MESSAGE, null)};
}

/**
 * HttpException 의 response(문자열 또는 객체)를 실패 본문으로 정규화한다.
 * `message` 가 배열이면 첫 항목을 쓰고, `validation_errors` 가 없으면 null 로 채운다(필드 생략 금지).
 *
 * service 가 넣은 추가 필드(예: 정지 계정의 `block_comment`)는 그대로 보존한다.
 * Nest 기본 예외가 붙이는 `statusCode` · `error` 는 상태 코드와 중복이므로 버린다.
 *
 * @param response HttpException.getResponse() 값
 * @param fallback response 에 메시지가 없을 때 쓸 메시지
 * @returns 실패 본문
 */
export function normalizeFailBody(response: string | object, fallback: string): ApiFailResultDto {
    if (typeof response === 'string') return createFailBody(response, null);

    const {message: rawMessage, validation_errors: rawErrors, statusCode: _statusCode, error: _error, ...extra} = response as Record<string, unknown>;
    const message = Array.isArray(rawMessage) ? String(rawMessage[0] ?? fallback) : typeof rawMessage === 'string' ? rawMessage : fallback;
    const validationErrors = Array.isArray(rawErrors) ? (rawErrors as ValidationErrorResultDto[]) : null;
    return Object.assign(createFailBody(message, validationErrors), extra);
}

/**
 * 실패 본문 인스턴스를 만든다.
 *
 * @param message 메시지
 * @param validationErrors 입력 필드 오류 목록 또는 null
 * @returns 실패 본문
 */
export function createFailBody(message: string, validationErrors: ValidationErrorResultDto[] | null): ApiFailResultDto {
    const body = new ApiFailResultDto();
    body.message = message;
    body.validation_errors = validationErrors;
    return body;
}
