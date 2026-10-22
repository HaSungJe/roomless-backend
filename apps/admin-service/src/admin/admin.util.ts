import {AdminAuthUserResultDto} from '@app/contracts/admin/dto/admin-auth-user.dto.js';
import type {LoginAdminRow} from './interfaces/admin.repository.interface.js';

/**
 * 로그인 관리자 조회 행을 게이트웨이 인증용 결과 DTO 로 바꾼다.
 *
 * @param row 로그인 관리자 조회 결과
 * @returns 로그인 관리자 정보
 */
export function toAdminAuthUserResult(row: LoginAdminRow): AdminAuthUserResultDto {
    const result = new AdminAuthUserResultDto();
    result.user_id = row.user_id;
    result.login_id = row.login_id;
    result.name = row.name;
    result.auth_id = row.auth_id;
    result.state_id = row.state_id;
    result.is_login_allowed = row.is_login_allowed;
    return result;
}
