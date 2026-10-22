import {BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {Transactional} from '@nestjs-cls/transactional';
import dayjs from 'dayjs';
import {In} from 'typeorm';
import {BLOCKED_ACCOUNT_MESSAGE, INVALID_LOGIN_MESSAGE, INVALID_TOKEN_MESSAGE, USER_NOT_FOUND_MESSAGE} from '@app/account/account.constants.js';
import {issueAccessAndRefresh} from '@app/account/utils/token.js';
import {getBcrypt, matchBcrypt} from '@app/common/utils/bcrypt.js';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {generateId} from '@app/common/utils/id.js';
import type {AdminAuthUserResultDto} from '@app/contracts/admin/dto/admin-auth-user.dto.js';
import type {AdminLoginDto, AdminLoginResultDto} from '@app/contracts/admin/dto/admin-login.dto.js';
import type {AdminPasswordDto} from '@app/contracts/admin/dto/admin-password.dto.js';
import type {AdminTokenRefreshDto, AdminTokenRefreshResultDto} from '@app/contracts/admin/dto/admin-token-refresh.dto.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {ADMIN_REPOSITORY} from './admin.symbols.js';
import {toAdminAuthUserResult} from './admin.util.js';
import type {AdminRepositoryInterface} from './interfaces/admin.repository.interface.js';

/**
 * 관리자 도메인 비즈니스 로직 (헥사고날의 안쪽) — 관리자 로그인 그룹(총관리자 SUPER_ADMIN · 관리자 ADMIN)만 다룬다.
 * 다른 그룹 계정은 조회 조건(login_scope = ADMIN)에서 걸러져 없는 계정과 같다. 관리자는 아이디 찾기 · 비밀번호 초기화가 없다.
 * 내부 HTTP 컨트롤러와 RabbitMQ 핸들러가 같은 메서드를 호출한다. public 메서드 1개 = API 1개.
 */
@Injectable()
export class AdminService {
    /**
     * @param adminRepository 관리자 repository 포트
     * @param jwtService 토큰 서명기
     */
    constructor(
        @Inject(ADMIN_REPOSITORY)
        private readonly adminRepository: AdminRepositoryInterface,
        private readonly jwtService: JwtService,
    ) {}

    /**
     * 관리자 로그인 (내부 HTTP: POST /internal/v1/admin/login)
     * - login_id + 관리자 그룹 + state_id IN (ACTIVE, BLOCK) 조회 → 미존재(다른 그룹 포함) 404
     * - 비밀번호 불일치 → 동일 404 (아이디/비밀번호 구분 비노출)
     * - BLOCK → 403 + block_comment (비밀번호 검증 후 판정 — 비밀번호 없이 정지 여부 탐지 방지)
     *
     * @param dto 로그인 정보
     * @param ip 클라이언트 IP
     * @returns 토큰 4종 + 비밀번호 변경 필요 여부 + 권한
     */
    @Transactional()
    async login(dto: AdminLoginDto, ip: string): Promise<AdminLoginResultDto> {
        // 1. 관리자 조회 (ACTIVE / BLOCK 만)
        const admin = await this.adminRepository.findAdmin({login_id: dto.login_id, login_scope: LOGIN_SCOPE.ADMIN, state_id: In(['ACTIVE', 'BLOCK'])});
        if (!admin) {
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 2. 비밀번호 검증 — 실패 시 미존재와 동일 404
        const matched = await matchBcrypt(dto.login_pw, admin.login_pw);
        if (!matched) {
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 3. BLOCK 차단 (비밀번호 검증 후)
        if (admin.state_id === 'BLOCK') {
            throw new HttpException({message: BLOCKED_ACCOUNT_MESSAGE, block_comment: admin.block_comment}, HttpStatus.FORBIDDEN);
        }

        // 4. device 정보 입력 시 t_user 동기화
        if (dto.device_os && dto.device_token) {
            const deviceEntity = new UserEntity();
            deviceEntity.device_os = dto.device_os;
            deviceEntity.device_token = dto.device_token;
            await this.adminRepository.updateAdmin({user_id: admin.user_id}, deviceEntity);
        }

        // 5. session 생성
        const session_id = generateId();
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = admin.user_id;
        sessionEntity.ip = ip || null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_deleted = 0;
        await this.adminRepository.insertSession(sessionEntity);

        // 6. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: admin.user_id, session_id});

        // 7. refresh 저장
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.previous_refresh_hash = null;
        sessionRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;
        await this.adminRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_password_change_required: admin.is_password_change_required,
            auth_id: admin.auth_id,
        };
    }

    /**
     * 관리자 토큰 재발급 (내부 HTTP: POST /internal/v1/admin/token-refresh)
     * - 서명 · 만료 · payload type 검증 실패 → 401
     * - refresh_hash 로 t_session_refresh 조회, 미존재 · DB expires_at 경과 → 401
     * - 세션 미존재 · 로그인 시점 ip 와 요청 ip 불일치 → 401 (어느 한쪽 ip 가 없으면 비교 생략)
     * - 회원이 ACTIVE 가 아니거나 관리자 그룹이 아니면 401 + 안전망으로 expires_at 단축
     * - old refresh expires_at = now + 1m 단축(grace) 후 새 토큰 발급, previous_refresh_hash 로 체인 연결
     *
     * @param dto refresh token
     * @param ip 클라이언트 IP
     * @returns 토큰 4종
     */
    @Transactional()
    async tokenRefresh(dto: AdminTokenRefreshDto, ip: string): Promise<AdminTokenRefreshResultDto> {
        // 1. JWT 검증
        let payload: {type: string; user_id: string; session_id: string};
        try {
            payload = this.jwtService.verify(dto.refresh_token);
        } catch {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }
        if (payload.type !== 'refresh') {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 2. DB 조회 (refresh_hash) + DB expires_at 만료 확인 (chain 재사용 차단)
        const refresh_hash = sha256Hex(dto.refresh_token);
        const oldRefresh = await this.adminRepository.findSessionRefresh({refresh_hash});
        if (!oldRefresh) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }
        if (oldRefresh.expires_at.getTime() < Date.now()) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 3. 세션 ip 체크 — 로그인 시점 저장 ip 와 불일치 시 거부(만료 단축 없음)
        const session = await this.adminRepository.findSession({session_id: payload.session_id});
        if (!session) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }
        if (session.ip && ip && session.ip !== ip) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 4. 회원 state · 관리자 그룹 재검증 — 안전망: expires_at 단축
        const admin = await this.adminRepository.findAdmin({user_id: payload.user_id});
        if (!admin || admin.state_id !== 'ACTIVE' || admin.login_scope !== LOGIN_SCOPE.ADMIN) {
            const expireEntity = new SessionRefreshEntity();
            expireEntity.expires_at = dayjs().add(1, 'minute').toDate();
            await this.adminRepository.updateSessionRefresh({refresh_hash}, expireEntity);
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 5. old refresh 단축 (1분 후 만료)
        const shrinkEntity = new SessionRefreshEntity();
        shrinkEntity.expires_at = dayjs().add(1, 'minute').toDate();
        await this.adminRepository.updateSessionRefresh({refresh_hash}, shrinkEntity);

        // 6. 새 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: payload.user_id, session_id: payload.session_id});

        // 7. 새 refresh insert (chain)
        const newRefreshEntity = new SessionRefreshEntity();
        newRefreshEntity.session_id = payload.session_id;
        newRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        newRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        newRefreshEntity.previous_refresh_hash = refresh_hash;
        newRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;
        await this.adminRepository.insertSessionRefresh(newRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
        };
    }

    /**
     * 로그인 관리자 조회 — 게이트웨이 jwt-admin 전략이 매 인증 요청마다 호출한다. (내부 HTTP: GET /internal/v1/admin/auth-user/:user_id)
     * 관리자 그룹이고 로그인 가능 상태(is_login_allowed = 1)인 회원만 돌려준다 — 다른 그룹 토큰은 여기서 404(게이트웨이 401).
     *
     * @param user_id 토큰의 회원 ID
     * @returns 로그인 관리자 정보
     */
    async getLoginAdmin(user_id: string): Promise<AdminAuthUserResultDto> {
        const row = await this.adminRepository.findLoginAdmin(user_id);
        if (!row) {
            throw new NotFoundException({message: '로그인 정보를 찾을 수 없습니다.'});
        }
        return toAdminAuthUserResult(row);
    }

    /**
     * 관리자 비밀번호 변경 — 성공 시 변경 필요 플래그를 함께 내린다(첫 총관리자 admin / 1234 도 이것으로 바꾼다). (RabbitMQ: admin.admin.password)
     *
     * @param user_id 로그인 관리자 ID
     * @param dto 현재 · 새 비밀번호
     */
    @Transactional()
    async changePassword(user_id: string, dto: AdminPasswordDto): Promise<void> {
        // 1. 대상 조회 (관리자 그룹만)
        const admin = await this.adminRepository.findAdmin({user_id, login_scope: LOGIN_SCOPE.ADMIN});
        if (!admin) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }

        // 2. 현재 비밀번호 검증
        const matched = await matchBcrypt(dto.current_password, admin.login_pw);
        if (!matched) {
            throw new BadRequestException({message: '현재 비밀번호가 일치하지 않습니다.'});
        }

        // 3. 동일 비밀번호 차단
        const same = await matchBcrypt(dto.new_password, admin.login_pw);
        if (same) {
            throw new BadRequestException({message: '기존 비밀번호와 다른 비밀번호를 입력해주세요.'});
        }

        // 4. 변경 + 플래그 해제
        const adminEntity = new UserEntity();
        adminEntity.login_pw = await getBcrypt(dto.new_password);
        adminEntity.is_password_change_required = 0;
        await this.adminRepository.updateAdmin({user_id}, adminEntity);
    }
}
