import {SetMetadata} from '@nestjs/common';

/** `@Roles` 메타데이터 키 */
export const ROLES_KEY = 'roles';

/**
 * 핸들러에 허용 권한(t_auth PK)을 지정한다. `@UseGuards(PassportJwtAuthGuard, RolesGuard)` 와 한 세트로 쓴다.
 *
 * @param roles 허용 권한 목록
 * @returns 데코레이터
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
