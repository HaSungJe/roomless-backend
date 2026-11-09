import {ILike, In} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {toContainsPattern} from '@app/common/utils/search.js';
import type {ManagerAccountDetailResultDto} from '@app/contracts/manager/dto/manager-account-detail.dto.js';
import type {ManagerAccountListDto, ManagerAccountListItemResultDto} from '@app/contracts/manager/dto/manager-account-list.dto.js';
import {ManagerAuthUserResultDto} from '@app/contracts/manager/dto/manager-auth-user.dto.js';
import type {ManagerStaffDetailResultDto} from '@app/contracts/manager/dto/manager-staff-detail.dto.js';
import type {ManagerStaffListDto, ManagerStaffListItemResultDto} from '@app/contracts/manager/dto/manager-staff-list.dto.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {LoginManagerRow, ManagerAccountFilter, ManagerAccountRow} from './interfaces/manager.repository.interface.js';
import {STAFF_STATES} from './manager.constants.js';

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

/**
 * 업체 인력 목록 WHERE — 그 업체의 매니저 그룹 · 삭제되지 않은 계정 + 검색어(아이디 · 이름 · 휴대폰 번호 OR).
 *
 * @param store_id 업체 총관리자의 업체 ID
 * @param dto 목록 query
 * @returns WHERE 배열 (OR)
 */
export function buildStaffListWhere(store_id: string, dto: ManagerStaffListDto): FindOptionsWhere<UserEntity>[] {
    const base: FindOptionsWhere<UserEntity> = {login_scope: LOGIN_SCOPE.MANAGER, store_id, state_id: In(STAFF_STATES)};
    if (!dto.keyword) {
        return [base];
    }
    const pattern = toContainsPattern(dto.keyword);
    return [
        {...base, login_id: ILike(pattern)},
        {...base, name: ILike(pattern)},
        {...base, phone: ILike(pattern)},
    ];
}

/**
 * 업체 인력 목록 항목
 *
 * @param entity 매니저 계정
 * @returns 목록 항목
 */
export function toStaffListItem(entity: UserEntity): ManagerStaffListItemResultDto {
    return {
        user_id: entity.user_id,
        login_id: entity.login_id,
        name: entity.name,
        phone: entity.phone ?? null,
        auth_id: entity.auth_id,
        state_id: entity.state_id,
        is_password_change_required: entity.is_password_change_required,
        created_at: entity.created_at.toISOString(),
    };
}

/**
 * 업체 관리자 상세
 *
 * @param entity 업체 관리자 계정
 * @returns 상세
 */
export function toStaffDetail(entity: UserEntity): ManagerStaffDetailResultDto {
    return {
        user_id: entity.user_id,
        login_id: entity.login_id,
        name: entity.name,
        phone: entity.phone ?? null,
        gender: entity.gender,
        birth: entity.birth,
        auth_id: entity.auth_id,
        state_id: entity.state_id,
        block_comment: entity.block_comment ?? null,
        is_password_change_required: entity.is_password_change_required,
        created_at: entity.created_at.toISOString(),
        updated_at: entity.updated_at.toISOString(),
    };
}

/**
 * 업체 관리자 등록 안내 SMS 본문 — 상호명 · 업체코드 · 아이디 · 임시 비밀번호.
 *
 * @param store_name 상호명
 * @param store_code 업체코드
 * @param login_id 아이디
 * @param password 임시 비밀번호
 * @returns 본문
 */
export function staffRegisteredText(store_name: string, store_code: string, login_id: string, password: string): string {
    return `[roomless] ${store_name} 업체 관리자 계정이 등록되었습니다. 업체코드 ${store_code} 아이디 ${login_id} 임시 비밀번호 ${password} — 로그인 후 비밀번호를 바꿔주세요.`;
}

/**
 * 업체 관리자 관리 필터 — 목록 query 를 repository 필터로(빈 값은 null).
 *
 * @param dto 목록 query
 * @returns 필터
 */
export function toAccountFilter(dto: ManagerAccountListDto): ManagerAccountFilter {
    return {user_id: null, keyword: dto.keyword || null, store_id: dto.store_id || null, auth_id: dto.auth_id || null, state_id: dto.state_id || null};
}

/**
 * 업체 관리자 목록 항목 (총관리자 · 관리자)
 *
 * @param row 업체 관리자 행
 * @returns 목록 항목
 */
export function toAccountListItem(row: ManagerAccountRow): ManagerAccountListItemResultDto {
    return {
        user_id: row.user_id,
        store_id: row.store_id,
        store_name: row.store_name,
        store_code: row.store_code,
        store_state_id: row.store_state_id,
        login_id: row.login_id,
        name: row.name,
        phone: row.phone ?? null,
        auth_id: row.auth_id,
        state_id: row.state_id,
        is_password_change_required: Number(row.is_password_change_required),
        created_at: new Date(row.created_at).toISOString(),
    };
}

/**
 * 업체 관리자 상세 (총관리자 · 관리자)
 *
 * @param row 업체 관리자 행
 * @returns 상세
 */
export function toAccountDetail(row: ManagerAccountRow): ManagerAccountDetailResultDto {
    return {...toAccountListItem(row), gender: row.gender, birth: row.birth, block_comment: row.block_comment ?? null};
}
