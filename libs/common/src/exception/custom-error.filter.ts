import {ArgumentsHost, Catch, ExceptionFilter} from '@nestjs/common';
import type {Response} from 'express';
import {toFailResult} from '@app/common/utils/fail-result.js';

/**
 * HTTP 인바운드 어댑터의 예외 출구.
 * 모든 예외를 `toFailResult()` 로 정규화해 상태 코드 + `{message, validation_errors}` 본문으로 응답한다.
 * RabbitMQ 핸들러는 같은 `toFailResult()` 결과를 failed 이벤트로 내보낸다.
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
        response.status(status_code).send(body);
    }
}
