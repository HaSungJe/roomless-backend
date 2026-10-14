import {createParamDecorator, ExecutionContext} from '@nestjs/common';
import type {Request} from 'express';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';

/**
 * 게이트웨이가 넘긴 클라이언트 IP. 헤더가 없으면 직접 접속한 IP 를 쓴다.
 * 서비스의 내부 HTTP 핸들러에서 `@Ip()` 대신 쓴다 — 서비스에 직접 붙는 상대는 항상 게이트웨이이기 때문.
 */
export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.header(INTERNAL_HEADER.CLIENT_IP) || request.ip || '';
});

/**
 * 게이트웨이가 넘긴 로그인 회원의 필드. 비로그인 요청이면 null.
 * 서비스의 내부 HTTP 핸들러에서 게이트웨이의 `@PassportUser('user_id')` 자리에 쓴다.
 */
export const InternalActor = createParamDecorator((field: 'user_id' | 'auth_id', ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const header = field === 'auth_id' ? INTERNAL_HEADER.ACTOR_AUTH_ID : INTERNAL_HEADER.ACTOR_USER_ID;
    return request.header(header) || null;
});
