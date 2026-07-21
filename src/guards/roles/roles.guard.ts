import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const requiredAuths = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredAuths) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();
        if (!requiredAuths.some((auth_id: string) => auth_id === user?.auth_id)) {
            // Nest 기본 영문 응답(Forbidden resource) 대신 프로젝트 규약의 한국어 메시지
            throw new ForbiddenException({message: '접근 권한이 없습니다.'});
        }
        return true;
    }
}
