import {ManagerAuthUserResultDto} from '@app/contracts/manager/dto/manager-auth-user.dto.js';
import type {LoginManagerRow} from './interfaces/manager.repository.interface.js';

/**
 * 로그인 매니저 조회 행을 게이트웨이 인증용 결과 DTO 로 바꾼다.
 *
 * @param row 로그인 매니저 조회 결과
 * @returns 로그인 매니저 정보
 */
export function toManagerAuthUserResult(row: LoginManagerRow): ManagerAuthUserResultDto {
    const result = new ManagerAuthUserResultDto();
    result.user_id = row.user_id;
    result.login_id = row.login_id;
    result.name = row.name;
    result.auth_id = row.auth_id;
    result.store_id = row.store_id;
    result.state_id = row.state_id;
    result.is_login_allowed = row.is_login_allowed;
    return result;
}
