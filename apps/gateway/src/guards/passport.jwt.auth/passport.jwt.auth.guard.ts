import {Injectable, UnauthorizedException} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';

/** 인증 실패 메시지 (토큰 없음 · 서명 오류 · 만료 · 로그인 불가 회원) */
export const AUTH_INVALID_MESSAGE = '로그인 정보가 유효하지 않습니다.';

/**
 * JWT 인증 가드 — 핸들러 단위로 붙인다.
 * passport 기본 영문 401 대신 프로젝트 규약의 한국어 메시지로 응답한다.
 */
@Injectable()
export class PassportJwtAuthGuard extends AuthGuard('jwt-user') {
    /**
     * 전략 결과를 받아 회원을 돌려주거나 401 을 던진다.
     *
     * @param error 전략 오류
     * @param user 전략이 돌려준 회원
     * @returns 회원
     */
    handleRequest<TUser>(error: unknown, user: TUser | false): TUser {
        if (error || !user) {
            throw new UnauthorizedException({message: AUTH_INVALID_MESSAGE});
        }
        return user;
    }
}
