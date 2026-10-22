import {createParamDecorator, ExecutionContext} from '@nestjs/common';
import type {Actor} from '@app/contracts/actor.js';
import type {UserAuthUserResultDto} from '@app/contracts/user/dto/user-auth-user.dto.js';

/**
 * 로그인 이용자 정보(또는 그 필드) — 이용자 라우트용. `@PassportUser('user_id') user_id: string`
 */
export const PassportUser = createParamDecorator((field: keyof UserAuthUserResultDto | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<{user?: UserAuthUserResultDto}>().user;
    return field ? user?.[field] : user;
});

/**
 * 로그인 회원을 서비스로 넘길 Actor(user_id · auth_id)로 꺼낸다 — 세 로그인 그룹(이용자 · 매니저 · 관리자) 공통.
 * 서비스로 전달하는 게이트웨이 핸들러는 `@PassportUser` 대신 이것을 첫 파라미터로 쓴다.
 */
export const PassportActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
    const user = ctx.switchToHttp().getRequest<{user?: {user_id?: string; auth_id?: string}}>().user;
    return {user_id: user?.user_id ?? '', auth_id: user?.auth_id ?? ''};
});
