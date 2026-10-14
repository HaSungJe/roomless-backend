import {Module} from '@nestjs/common';
import {PassportModule} from '@nestjs/passport';
import {PassportJwtAuthStrategy} from './passport.jwt.auth.strategy.js';

/**
 * 게이트웨이 인증 — JWT 전략 등록. 가드(PassportJwtAuthGuard · RolesGuard)는 핸들러에서 직접 쓴다.
 */
@Module({imports: [PassportModule], providers: [PassportJwtAuthStrategy]})
export class PassportJwtAuthModule {}
