import {CanActivate, ExecutionContext, ForbiddenException, Injectable} from '@nestjs/common';
import {timingSafeEqual} from 'node:crypto';
import type {Request} from 'express';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';

/** 내부 요청 거부 메시지 */
export const INTERNAL_ONLY_MESSAGE = '내부 요청만 허용됩니다.';

/**
 * 두 문자열을 길이 · 내용 모두 일정한 시간에 비교한다(시간차로 토큰을 추측하는 공격 방지).
 *
 * @param received 받은 값
 * @param expected 기대 값
 * @returns 같으면 true
 */
function safeEqual(received: string, expected: string): boolean {
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * 서비스 앱의 모든 HTTP 요청을 지킨다 — 서비스 루트 모듈에 APP_GUARD 로 등록해 컨트롤러마다 붙이지 않는다.
 * 게이트웨이가 붙인 `x-internal-token` 이 INTERNAL_API_TOKEN 과 같을 때만 통과시킨다.
 * 토큰이 설정되지 않은 환경에서는 모든 요청을 거부한다(설정 누락으로 열려 버리는 것을 막음).
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
    /**
     * 내부 토큰을 비교한다.
     *
     * @param context 실행 컨텍스트
     * @returns 일치하면 true
     * @throws ForbiddenException 불일치 · 미설정
     */
    canActivate(context: ExecutionContext): boolean {
        const expected = process.env.INTERNAL_API_TOKEN;
        const received = context.switchToHttp().getRequest<Request>().header(INTERNAL_HEADER.TOKEN);
        if (!expected || !received || !safeEqual(received, expected)) {
            throw new ForbiddenException({message: INTERNAL_ONLY_MESSAGE});
        }
        return true;
    }
}
