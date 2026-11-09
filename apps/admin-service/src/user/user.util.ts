import {ILike} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {toContainsPattern} from '@app/common/utils/search.js';
import type {UserDetailResultDto, UserReservationSummaryResultDto} from '@app/contracts/user/dto/user-detail.dto.js';
import type {UserListDto, UserListItemResultDto} from '@app/contracts/user/dto/user-list.dto.js';
import type {UserReservationListItemResultDto} from '@app/contracts/user/dto/user-reservation-list.dto.js';
import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserReservationCountRow, UserReservationRow} from './interfaces/user.repository.interface.js';
import {USER_CHANGEABLE_STATES, USER_RESERVATION_IN_PROGRESS_STATES} from './user.constants.js';

/**
 * 이용자 목록 조건 — 이용자 그룹 + 상태 · SNS 필터, 검색어가 있으면 이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드 부분 일치(배열 = OR).
 *
 * @param dto 목록 query
 * @returns 조회 조건
 */
export function buildUserListWhere(dto: UserListDto): FindOptionsWhere<UserEntity>[] {
    const base: FindOptionsWhere<UserEntity> = {login_scope: LOGIN_SCOPE.USER};
    if (dto.state_id) {
        base.state_id = dto.state_id;
    }
    if (dto.sns_id) {
        base.sns_id = dto.sns_id;
    }
    if (!dto.keyword) {
        return [base];
    }
    const pattern = toContainsPattern(dto.keyword);
    return [
        {...base, name: ILike(pattern)},
        {...base, nickname: ILike(pattern)},
        {...base, phone: ILike(pattern)},
        {...base, user_search_code: ILike(pattern)},
    ];
}

/**
 * 관리자 이용 제한 · 해제 판정 — 정상 ↔ 이용 제한만(사용자 결정 2026-11-09). 할 수 없으면 사유.
 *
 * @param current 지금 상태
 * @param next 바꿀 상태
 * @returns 못 하는 사유 또는 null
 */
export function judgeUserStateChange(current: string, next: string): string | null {
    if (!USER_CHANGEABLE_STATES.includes(current)) {
        return '탈퇴 대기 · 탈퇴 회원은 상태를 바꿀 수 없습니다.';
    }
    if (current === next) {
        return '이미 같은 상태입니다.';
    }
    return null;
}

/**
 * 예약 건수 요약 — 상태별 건수 행을 전체(결제 대기 만료 제외) · 진행 중 · 이용 완료 · 취소로. PostgreSQL count 는 문자열이라 숫자로 바꾼다.
 *
 * @param rows 상태별 건수
 * @returns 요약
 */
export function toReservationSummary(rows: UserReservationCountRow[]): UserReservationSummaryResultDto {
    const summary = {total: 0, in_progress: 0, completed: 0, canceled: 0};
    for (const row of rows) {
        const count = Number(row.count);
        if (row.reservation_state_id === RESERVATION_STATE.EXPIRED) {
            continue;
        }
        summary.total += count;
        if (USER_RESERVATION_IN_PROGRESS_STATES.includes(row.reservation_state_id)) {
            summary.in_progress += count;
        } else if (row.reservation_state_id === RESERVATION_STATE.COMPLETED) {
            summary.completed += count;
        } else if (row.reservation_state_id === RESERVATION_STATE.CANCELED) {
            summary.canceled += count;
        }
    }
    return summary;
}

/**
 * 이용자 목록 항목
 *
 * @param entity 이용자
 * @returns 목록 항목
 */
export function toUserListItem(entity: UserEntity): UserListItemResultDto {
    return {
        user_id: entity.user_id,
        user_search_code: entity.user_search_code,
        nickname: entity.nickname,
        name: entity.name,
        phone: entity.phone ?? null,
        sns_id: entity.sns_id ?? null,
        state_id: entity.state_id,
        is_phone_verified: entity.phone_verified_at ? 1 : 0,
        created_at: entity.created_at.toISOString(),
    };
}

/**
 * 이용자 상세
 *
 * @param entity 이용자
 * @param reservation_summary 예약 건수 요약
 * @returns 상세
 */
export function toUserDetail(entity: UserEntity, reservation_summary: UserReservationSummaryResultDto): UserDetailResultDto {
    return {
        user_id: entity.user_id,
        user_search_code: entity.user_search_code,
        nickname: entity.nickname,
        name: entity.name,
        gender: entity.gender,
        birth: entity.birth,
        phone: entity.phone ?? null,
        phone_verified_at: entity.phone_verified_at ? entity.phone_verified_at.toISOString() : null,
        sns_id: entity.sns_id ?? null,
        state_id: entity.state_id,
        block_comment: entity.block_comment ?? null,
        leave_reserved_at: entity.leave_reserved_at ?? null,
        created_at: entity.created_at.toISOString(),
        reservation_summary,
    };
}

/**
 * 이용자 예약 이력 항목 — raw 행의 시각 · 금액을 응답 모양으로.
 *
 * @param row 예약 행
 * @returns 이력 항목
 */
export function toUserReservationItem(row: UserReservationRow): UserReservationListItemResultDto {
    return {
        reservation_id: row.reservation_id,
        store_id: row.store_id,
        store_name: row.store_name,
        room_name: row.room_name,
        room_group_name: row.room_group_name,
        room_plan_type_id: row.room_plan_type_id,
        room_plan_type_name: row.room_plan_type_name,
        reservation_state_id: row.reservation_state_id,
        reservation_state_name: row.reservation_state_name,
        start_at: new Date(row.start_at).toISOString(),
        end_at: new Date(row.end_at).toISOString(),
        total_price: Number(row.total_price),
        canceled_at: row.canceled_at ? new Date(row.canceled_at).toISOString() : null,
        cancel_actor: row.cancel_actor ?? null,
        created_at: new Date(row.created_at).toISOString(),
    };
}
