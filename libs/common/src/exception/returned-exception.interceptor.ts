import {CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor} from '@nestjs/common';
import {map, type Observable} from 'rxjs';

/**
 * 내부 HTTP 컨트롤러가 반환한 HttpException 을 실패 응답으로 바꾼다.
 * service 가 쓰기를 커밋한 뒤 실패를 알릴 때 예외를 throw 하지 않고 return 한다. 반환값을 여기서 다시 throw 하면
 * CustomErrorFilter 가 상태 코드 + 실패 본문(toFailResult)으로 응답한다. 큐 경로는 CommandDispatcher 가 같은 일을 한다.
 * 서비스 루트 모듈에 `{provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}` 로 전역 등록한다.
 */
@Injectable()
export class ReturnedExceptionInterceptor implements NestInterceptor {
    /**
     * 반환값이 HttpException 이면 에러로 바꾸고, 아니면 그대로 흘려보낸다.
     *
     * @param _context 실행 컨텍스트
     * @param next 다음 핸들러
     * @returns 반환값 스트림
     */
    intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(
            map((value: unknown) => {
                if (value instanceof HttpException) {
                    throw value;
                }
                return value;
            }),
        );
    }
}
