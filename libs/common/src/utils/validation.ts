import {BadRequestException} from '@nestjs/common';
import type {ValidationError} from '@nestjs/common';
import {ValidationErrorResultDto} from '@app/common/dto/global.result.dto.js';

/** 검증 오류가 비어 있을 때의 메시지 */
export const VALIDATION_FALLBACK_MESSAGE = '실패했습니다.';

/**
 * service 에서 입력 필드에 귀속되는 비즈니스 오류를 만들 때 쓴다.
 * 예: `throw new BadRequestException({message, validation_errors: createValidationError('birth', message)})`
 *
 * @param property 오류가 귀속되는 입력 필드명
 * @param message 한국어 메시지
 * @returns 유효성검사 오류 목록(1건)
 */
export function createValidationError(property: string, message: string): ValidationErrorResultDto[] {
    const error = new ValidationErrorResultDto();
    error.property = property;
    error.message = message;
    return [error];
}

/**
 * class-validator 오류 1건을 ValidationErrorResultDto 로 바꾼다.
 * 첫 번째 제약의 메시지를 쓰고, 그 제약이 `isBoolean` 이며 context.target 이 있으면 그 값을 대상 필드로 쓴다.
 *
 * @param error class-validator 오류
 * @param property 대상 필드 — 중첩이면 점 경로(`hours.0.open_time`), 기본은 그 오류의 필드명
 * @returns 유효성검사 오류 1건
 */
export function toValidationErrorResultDto(error: ValidationError, property: string = error.property): ValidationErrorResultDto {
    const constraints = error.constraints ?? {};
    const constraint = Object.keys(constraints)[0];
    const target = constraint === 'isBoolean' ? error.contexts?.[constraint]?.target : undefined;
    const dto = new ValidationErrorResultDto();
    dto.property = target ? String(target) : property;
    dto.message = (constraint && constraints[constraint]) || VALIDATION_FALLBACK_MESSAGE;
    return dto;
}

/**
 * 중첩 DTO 의 오류를 펼친다 — 제약이 걸린 오류마다 1건, 대상 필드는 부모부터 이은 점 경로.
 * 배열 자체의 제약(@ArrayMaxSize 등)과 항목의 제약이 같이 있으면 둘 다 담는다. 제약도 자식도 없으면 기본 메시지 1건.
 *
 * @param error class-validator 오류
 * @param parent 부모 경로 (첫 단은 '')
 * @returns 유효성검사 오류 목록
 */
function flattenValidationError(error: ValidationError, parent: string): ValidationErrorResultDto[] {
    const property = parent ? `${parent}.${error.property}` : error.property;
    const children = error.children ?? [];
    const own = error.constraints || children.length === 0 ? [toValidationErrorResultDto(error, property)] : [];
    return [...own, ...children.flatMap((child) => flattenValidationError(child, property))];
}

/**
 * 전역 ValidationPipe 의 exceptionFactory.
 * main.ts 와 테스트가 같은 함수를 쓴다(테스트에서 main.ts 를 손으로 재현하지 않는다). 중첩 DTO 의 오류는 점 경로로 펼친다.
 *
 * @param errors class-validator 오류 목록
 * @returns `{message, validation_errors}` 본문의 400 예외
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
    const validationErrors = errors.flatMap((error) => flattenValidationError(error, ''));
    const message = validationErrors[0]?.message ?? VALIDATION_FALLBACK_MESSAGE;
    return new BadRequestException({message, validation_errors: validationErrors});
}
