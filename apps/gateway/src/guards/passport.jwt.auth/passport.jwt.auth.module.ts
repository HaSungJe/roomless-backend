import {Module} from '@nestjs/common';
import {PassportModule} from '@nestjs/passport';
import {PassportJwtAdminAuthStrategy} from './passport.jwt.admin.strategy.js';
import {PassportJwtAuthStrategy} from './passport.jwt.auth.strategy.js';
import {PassportJwtManagerAuthStrategy} from './passport.jwt.manager.strategy.js';

/**
 * 게이트웨이 인증 — 로그인 그룹별 JWT 전략 등록(이용자 `jwt-user` · 매니저 `jwt-manager` · 관리자 `jwt-admin`).
 * 가드(PassportJwtAuthGuard · PassportJwtManagerAuthGuard · PassportJwtAdminAuthGuard, 그룹 안 권한을 좁힐 때 RolesGuard)는 핸들러에서 직접 쓴다.
 */
@Module({imports: [PassportModule], providers: [PassportJwtAuthStrategy, PassportJwtManagerAuthStrategy, PassportJwtAdminAuthStrategy]})
export class PassportJwtAuthModule {}
