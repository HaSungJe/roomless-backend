import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {Not} from 'typeorm';
import {Pagination} from '@app/common/utils/pagination.js';
import type {UserDetailResultDto} from '@app/contracts/user/dto/user-detail.dto.js';
import type {UserListDto, UserListResultDto} from '@app/contracts/user/dto/user-list.dto.js';
import type {UserReservationListDto, UserReservationListResultDto} from '@app/contracts/user/dto/user-reservation-list.dto.js';
import type {UserStateDto} from '@app/contracts/user/dto/user-state.dto.js';
import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserRepositoryInterface} from './interfaces/user.repository.interface.js';
import {USER_NOT_FOUND_MESSAGE, USER_STATE_BLOCK} from './user.constants.js';
import {USER_REPOSITORY} from './user.symbols.js';
import {buildUserListWhere, judgeUserStateChange, toReservationSummary, toUserDetail, toUserListItem, toUserReservationItem} from './user.util.js';

/**
 * 이용자 관리 service(admin-service — 총관리자 · 관리자) — 이용자 목록 · 상세 · 예약 이력 · 이용 제한 · 해제.
 * 이용 제한(BLOCK)은 이용자 그룹에서 로그인 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다(user-service — 사용자 결정 2026-11-09).
 * 이용자 본인 기능(가입 · 로그인 · 탈퇴)은 user-service user 다(서버 안 도메인은 기능 대상별 — 같은 이름 따로).
 */
@Injectable()
export class UserService {
    /**
     * @param userRepository 이용자 관리 repository 포트
     */
    constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryInterface) {}

    /**
     * 이용자 목록 — 이용자 그룹 · 상태 · SNS · 검색어, 가입 최신순. (내부 HTTP: GET /internal/v1/admin-service/user)
     *
     * @param dto 페이지 · 필터 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getUserList(dto: UserListDto): Promise<UserListResultDto> {
        const where = buildUserListWhere(dto);
        const total_count = await this.userRepository.countUsers(where);
        const pagination = new Pagination({...dto, total_count});
        const users = await this.userRepository.findUserList(where, pagination.limit, pagination.offset);
        return {list: users.map(toUserListItem), pagination: pagination.getPagination()};
    }

    /**
     * 이용자 상세 — 회원 정보 + 예약 건수 요약(결제 대기 만료 제외). (내부 HTTP: GET /internal/v1/admin-service/user/:user_id)
     *
     * @param user_id 이용자 회원 ID
     * @returns 상세
     */
    async getUser(user_id: string): Promise<UserDetailResultDto> {
        const user = await this.userRepository.findUser({user_id, login_scope: LOGIN_SCOPE.USER});
        if (!user) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }
        const counts = await this.userRepository.findReservationCounts(user.user_id);
        return toUserDetail(user, toReservationSummary(counts));
    }

    /**
     * 이용자 예약 이력 — 결제 대기 만료 제외, 이용 시작 최신순. (내부 HTTP: GET /internal/v1/admin-service/user/:user_id/reservation)
     *
     * @param user_id 이용자 회원 ID
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getUserReservations(user_id: string, dto: UserReservationListDto): Promise<UserReservationListResultDto> {
        const user = await this.userRepository.findUser({user_id, login_scope: LOGIN_SCOPE.USER});
        if (!user) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }
        const total_count = await this.userRepository.countUserReservations({user_id: user.user_id, reservation_state_id: Not(RESERVATION_STATE.EXPIRED)});
        const pagination = new Pagination({...dto, total_count});
        const rows = await this.userRepository.findUserReservationRows(user.user_id, pagination.limit, pagination.offset);
        return {list: rows.map(toUserReservationItem), pagination: pagination.getPagination()};
    }

    /**
     * 이용자 이용 제한 · 해제 — ACTIVE ↔ BLOCK 만, 같은 상태 · 탈퇴 대기 · 탈퇴 회원은 400. 사유는 제한할 때만 남기고 해제하면 지운다.
     * 상태 조건을 건 쓰기 — 그 사이 탈퇴 신청 등으로 바뀌었으면 400 롤백. 남은 예약은 그대로(사용자 결정 2026-11-09). (RabbitMQ: admin.user.state)
     *
     * @param user_id 이용자 회원 ID
     * @param dto 바꿀 상태 · 제한 사유
     */
    @Transactional()
    async changeUserState(user_id: string, dto: UserStateDto): Promise<void> {
        // 1. 이용자 · 바꿀 수 있는 상태인지
        const user = await this.userRepository.findUser({user_id, login_scope: LOGIN_SCOPE.USER});
        if (!user) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }
        const reason = judgeUserStateChange(user.state_id, dto.state_id);
        if (reason) {
            throw new BadRequestException({message: reason});
        }

        // 2. 상태 · 제한 사유 (지금 상태 조건)
        const userEntity = new UserEntity();
        userEntity.state_id = dto.state_id;
        userEntity.block_comment = dto.state_id === USER_STATE_BLOCK ? (dto.block_comment ?? null) : null;
        if (!(await this.userRepository.updateUser({user_id: user.user_id, login_scope: LOGIN_SCOPE.USER, state_id: user.state_id}, userEntity))) {
            throw new BadRequestException({message: '회원 상태가 바뀌었습니다. 다시 확인해주세요.'});
        }
    }
}
