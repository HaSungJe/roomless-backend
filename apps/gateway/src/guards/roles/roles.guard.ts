import {CanActivate, ExecutionContext, ForbiddenException, Injectable} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {ROLES_KEY} from './roles.decorator.js';

/** 권한 부족 메시지 */
export const FORBIDDEN_MESSAGE = '접근 권한이 없습니다.';

/**
 * 역할 기반 권한 가드 — 인증 가드 뒤에 둔다. 불일치 시 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
    /**
     * @param reflector 메타데이터 조회
     */
    constructor(private readonly reflector: Reflector) {}

    /**
     * 로그인 회원의 auth_id 가 허용 권한에 있는지 본다.
     *
     * @param context 실행 컨텍스트
     * @returns 통과 여부
     * @throws ForbiddenException 권한 불일치
     */
    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
        if (!required) return true;

        const user = context.switchToHttp().getRequest<{user?: {auth_id?: string}}>().user;
        if (!required.some((auth_id) => auth_id === user?.auth_id)) {
            throw new ForbiddenException({message: FORBIDDEN_MESSAGE});
        }
        return true;
    }
}
