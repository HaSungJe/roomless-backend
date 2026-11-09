import {ArgumentsHost, Catch, ExceptionFilter, HttpException} from '@nestjs/common';
import type {Response} from 'express';
import {toFailResult} from '@app/common/utils/fail-result.js';

/** 예상 못 한 오류(HttpException 이 아닌 Error)의 stack 을 담는 응답 locals 키 — 게이트웨이 API 로그 미들웨어가 읽는다(서비스는 읽는 곳이 없다) */
export const ERROR_STACK_LOCAL = 'error_stack';

/**
 * HTTP 인바운드 어댑터의 예외 출구.
 * 모든 예외를 `toFailResult()` 로 정규화해 상태 코드 + `{message, validation_errors}` 본문으로 응답한다.
 * RabbitMQ 핸들러는 같은 `toFailResult()` 결과를 failed 이벤트로 내보낸다.
 * 예상 못 한 오류(HttpException 이 아닌 Error)는 stack 을 `res.locals` 에 남긴다 — 게이트웨이 API 로그가 실패 사유로 적재한다.
 */
@Catch()
export class CustomErrorFilter implements ExceptionFilter {
    /**
     * 예외를 HTTP 응답으로 변환한다.
     *
     * @param exception 잡힌 예외
     * @param host 실행 컨텍스트
     */
    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();
        const {status_code, body} = toFailResult(exception);
        if (exception instanceof Error && !(exception instanceof HttpException)) {
            response.locals[ERROR_STACK_LOCAL] = exception.stack ?? null;
        }
        response.status(status_code).send(body);
    }
}
