import {BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {Transactional} from '@nestjs-cls/transactional';
import dayjs from 'dayjs';
import {In} from 'typeorm';
import {getBcrypt, matchBcrypt} from '@app/common/utils/bcrypt.js';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {UserAuthUserResultDto} from '@app/contracts/user/dto/user-auth-user.dto.js';
import type {UserGeneralLoginDto, UserGeneralLoginResultDto} from '@app/contracts/user/dto/user-general-login.dto.js';
import type {UserGeneralSignDto, UserGeneralSignResultDto} from '@app/contracts/user/dto/user-general-sign.dto.js';
import type {UserLeaveDto} from '@app/contracts/user/dto/user-leave.dto.js';
import type {UserLoginDto, UserLoginResultDto} from '@app/contracts/user/dto/user-login.dto.js';
import type {UserPasswordDto} from '@app/contracts/user/dto/user-password.dto.js';
import type {UserSignDto, UserSignResultDto} from '@app/contracts/user/dto/user-sign.dto.js';
import type {UserTokenRefreshDto, UserTokenRefreshResultDto} from '@app/contracts/user/dto/user-token-refresh.dto.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {UserSettingEntity} from '@app/database/entities/user/user-setting.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserRepositoryInterface} from './interfaces/user.repository.interface.js';
import {USER_REPOSITORY} from './user.symbols.js';
import {generateId, generateSnsLoginId, isAdult, issueAccessAndRefresh, toUserAuthUserResult} from './user.util.js';

/** 만 18세 이하 가입 제한 메시지 */
const UNDERAGE_MESSAGE = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';

/**
 * 회원 비즈니스 로직 (헥사고날의 안쪽).
 * 내부 HTTP 컨트롤러와 RabbitMQ 핸들러가 같은 메서드를 호출한다 — 어느 경로에서 왔는지 모른다.
 * public 메서드 1개 = API 1개.
 */
@Injectable()
export class UserService {
    /**
     * @param userRepository 회원 repository 포트
     * @param jwtService 토큰 서명기
     */
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: UserRepositoryInterface,
        private readonly jwtService: JwtService,
    ) {}

    /**
     * SNS 회원가입 — SNS 식별정보로 회원/설정/세션 생성 후 토큰 4종 반환. (RabbitMQ: user.member.sign)
     *
     * @param dto 가입 정보
     * @param ip 클라이언트 IP
     * @returns 토큰 4종
     */
    @Transactional()
    async sign(dto: UserSignDto, ip: string): Promise<UserSignResultDto> {
        // 1. 만 18세 이하 가입 제한 — 입력 birth 에 귀속되므로 validation_errors 동봉
        if (!isAdult(dto.birth)) {
            throw new BadRequestException({message: UNDERAGE_MESSAGE, validation_errors: createValidationError('birth', UNDERAGE_MESSAGE)});
        }

        // 2. ID 생성
        const user_id = generateId();
        const session_id = generateId();
        const login_id = generateSnsLoginId(dto.sns_id);

        // 3. t_user 생성
        const userEntity = new UserEntity();
        userEntity.user_id = user_id;
        userEntity.user_search_code = generateId();
        userEntity.auth_id = 'USER';
        userEntity.state_id = 'ACTIVE';
        userEntity.sns_id = dto.sns_id;
        userEntity.sns_user_id = dto.sns_user_id;
        userEntity.login_id = login_id;
        userEntity.login_pw = await getBcrypt(login_id);
        userEntity.name = dto.nickname;
        userEntity.gender = dto.gender;
        userEntity.birth = dto.birth;
        userEntity.phone = null;
        userEntity.nickname = dto.nickname;
        userEntity.device_os = dto.device_os ?? null;
        userEntity.device_token = dto.device_token ?? null;
        userEntity.is_password_change_required = 0;
        await this.userRepository.insertUser(userEntity);

        // 4. t_user_setting 생성
        const userSettingEntity = new UserSettingEntity();
        userSettingEntity.user_setting_id = generateId();
        userSettingEntity.user_id = user_id;
        userSettingEntity.bio = null;
        await this.userRepository.insertUserSetting(userSettingEntity);

        // 5. t_session 생성
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user_id;
        sessionEntity.ip = ip || null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 6. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id, session_id});

        // 7. t_session_refresh 생성
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.before_refresh_hash = null;
        sessionRefreshEntity.end_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
        };
    }

    /**
     * 일반 회원가입 — 아이디/비밀번호로 회원/설정/세션 생성 후 토큰 4종 반환. sns_id/sns_user_id 는 null. (RabbitMQ: user.member.general-sign)
     *
     * @param dto 가입 정보
     * @param ip 클라이언트 IP
     * @returns 토큰 4종
     */
    @Transactional()
    async generalSign(dto: UserGeneralSignDto, ip: string): Promise<UserGeneralSignResultDto> {
        // 1. 만 18세 이하 가입 제한
        if (!isAdult(dto.birth)) {
            throw new BadRequestException({message: UNDERAGE_MESSAGE, validation_errors: createValidationError('birth', UNDERAGE_MESSAGE)});
        }

        // 2. ID 생성
        const user_id = generateId();
        const session_id = generateId();

        // 3. t_user 생성 — 일반 회원: sns 미보유. 아이디 중복은 UK_User_LoginId 분기 400
        const userEntity = new UserEntity();
        userEntity.user_id = user_id;
        userEntity.user_search_code = generateId();
        userEntity.auth_id = 'USER';
        userEntity.state_id = 'ACTIVE';
        userEntity.sns_id = null;
        userEntity.sns_user_id = null;
        userEntity.login_id = dto.login_id;
        userEntity.login_pw = await getBcrypt(dto.login_pw);
        userEntity.name = dto.nickname;
        userEntity.gender = dto.gender;
        userEntity.birth = dto.birth;
        userEntity.phone = null;
        userEntity.nickname = dto.nickname;
        userEntity.device_os = dto.device_os ?? null;
        userEntity.device_token = dto.device_token ?? null;
        userEntity.is_password_change_required = 0;
        await this.userRepository.insertUser(userEntity);

        // 4. t_user_setting 생성
        const userSettingEntity = new UserSettingEntity();
        userSettingEntity.user_setting_id = generateId();
        userSettingEntity.user_id = user_id;
        userSettingEntity.bio = null;
        await this.userRepository.insertUserSetting(userSettingEntity);

        // 5. t_session 생성
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user_id;
        sessionEntity.ip = ip || null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 6. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id, session_id});

        // 7. t_session_refresh 생성
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.before_refresh_hash = null;
        sessionRefreshEntity.end_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
        };
    }

    /**
     * SNS 로그인 (내부 HTTP: POST /internal/v1/user/login)
     * - (sns_id, sns_user_id) + state_id IN (ACTIVE, BLOCK) 로 조회, 미존재 → 404
     * - BLOCK → 403 + block_comment
     * - device_os/device_token 둘 다 입력된 경우에만 t_user 동기화(마지막 로그인 기기 유지)
     *
     * @param dto 로그인 정보
     * @param ip 클라이언트 IP
     * @returns 토큰 4종
     */
    @Transactional()
    async login(dto: UserLoginDto, ip: string): Promise<UserLoginResultDto> {
        // 1. 회원 조회 (ACTIVE / BLOCK 만)
        const user = await this.userRepository.findUser({sns_id: dto.sns_id, sns_user_id: dto.sns_user_id, state_id: In(['ACTIVE', 'BLOCK'])});
        if (!user) {
            throw new NotFoundException({message: '잘못된 로그인 정보입니다.'});
        }

        // 2. BLOCK 차단
        if (user.state_id === 'BLOCK') {
            throw new HttpException({message: '이용이 제한된 계정입니다.', block_comment: user.block_comment}, HttpStatus.FORBIDDEN);
        }

        // 3. device 정보 입력 시 t_user 동기화 — 미입력이면 기존값 보존(null 초기화 ❌)
        if (dto.device_os && dto.device_token) {
            const userDeviceEntity = new UserEntity();
            userDeviceEntity.device_os = dto.device_os;
            userDeviceEntity.device_token = dto.device_token;
            await this.userRepository.updateUser({user_id: user.user_id}, userDeviceEntity);
        }

        // 4. session 생성
        const session_id = generateId();
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user.user_id;
        sessionEntity.ip = ip || null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 5. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: user.user_id, session_id});

        // 6. refresh 저장
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.before_refresh_hash = null;
        sessionRefreshEntity.end_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
        };
    }

    /**
     * 일반 로그인 (내부 HTTP: POST /internal/v1/user/general-login)
     * - login_id + state_id IN (ACTIVE, BLOCK) 조회 → 미존재 404
     * - 비밀번호 불일치 → 동일 404 (아이디/비밀번호 구분 비노출)
     * - BLOCK → 403 + block_comment (비밀번호 검증 후 판정 — 비밀번호 없이 정지 여부 탐지 방지)
     *
     * @param dto 로그인 정보
     * @param ip 클라이언트 IP
     * @returns 토큰 4종 + 비밀번호 변경 필요 여부
     */
    @Transactional()
    async generalLogin(dto: UserGeneralLoginDto, ip: string): Promise<UserGeneralLoginResultDto> {
        // 1. 회원 조회 (ACTIVE / BLOCK 만)
        const user = await this.userRepository.findUser({login_id: dto.login_id, state_id: In(['ACTIVE', 'BLOCK'])});
        if (!user) {
            throw new NotFoundException({message: '잘못된 로그인 정보입니다.'});
        }

        // 2. 비밀번호 검증 — 실패 시 미존재와 동일 404
        const matched = await matchBcrypt(dto.login_pw, user.login_pw);
        if (!matched) {
            throw new NotFoundException({message: '잘못된 로그인 정보입니다.'});
        }

        // 3. BLOCK 차단 (비밀번호 검증 후)
        if (user.state_id === 'BLOCK') {
            throw new HttpException({message: '이용이 제한된 계정입니다.', block_comment: user.block_comment}, HttpStatus.FORBIDDEN);
        }

        // 4. device 정보 입력 시 t_user 동기화
        if (dto.device_os && dto.device_token) {
            const userDeviceEntity = new UserEntity();
            userDeviceEntity.device_os = dto.device_os;
            userDeviceEntity.device_token = dto.device_token;
            await this.userRepository.updateUser({user_id: user.user_id}, userDeviceEntity);
        }

        // 5. session 생성
        const session_id = generateId();
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user.user_id;
        sessionEntity.ip = ip || null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 6. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: user.user_id, session_id});

        // 7. refresh 저장
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.before_refresh_hash = null;
        sessionRefreshEntity.end_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_password_change_required: user.is_password_change_required,
        };
    }

    /**
     * 로그인 토큰 재발급 (내부 HTTP: POST /internal/v1/user/token-refresh)
     * - 서명 · 만료 · payload type 검증 실패 → 401
     * - refresh_hash 로 t_session_refresh 조회, 미존재 · DB end_at 경과 → 401
     * - 세션 미존재 · 로그인 시점 ip 와 요청 ip 불일치 → 401 (어느 한쪽 ip 가 없으면 비교 생략)
     * - 회원이 ACTIVE 가 아니면 401 + 안전망으로 end_at 단축
     * - old refresh end_at = now + 1m 단축(grace) 후 새 토큰 발급, before_refresh_hash 로 체인 연결
     *
     * @param dto refresh token
     * @param ip 클라이언트 IP
     * @returns 토큰 4종
     */
    @Transactional()
    async tokenRefresh(dto: UserTokenRefreshDto, ip: string): Promise<UserTokenRefreshResultDto> {
        // 1. JWT 검증
        let payload: {type: string; user_id: string; session_id: string};
        try {
            payload = this.jwtService.verify(dto.refresh_token);
        } catch {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }
        if (payload.type !== 'refresh') {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }

        // 2. DB 조회 (refresh_hash) + DB end_at 만료 확인 (chain 재사용 차단)
        const refresh_hash = sha256Hex(dto.refresh_token);
        const oldRefresh = await this.userRepository.findSessionRefresh({refresh_hash});
        if (!oldRefresh) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }
        if (oldRefresh.end_at.getTime() < Date.now()) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }

        // 3. 세션 ip 체크 — 로그인 시점 저장 ip 와 불일치 시 거부(만료 단축 없음)
        const session = await this.userRepository.findSession({session_id: payload.session_id});
        if (!session) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }
        if (session.ip && ip && session.ip !== ip) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }

        // 4. 회원 state 재검증 — 안전망: end_at 단축
        const user = await this.userRepository.findUser({user_id: payload.user_id});
        if (!user || user.state_id !== 'ACTIVE') {
            const expireEntity = new SessionRefreshEntity();
            expireEntity.end_at = dayjs().add(1, 'minute').toDate();
            await this.userRepository.updateSessionRefresh({refresh_hash}, expireEntity);
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }

        // 5. old refresh 단축 (1분 후 만료)
        const shrinkEntity = new SessionRefreshEntity();
        shrinkEntity.end_at = dayjs().add(1, 'minute').toDate();
        await this.userRepository.updateSessionRefresh({refresh_hash}, shrinkEntity);

        // 6. 새 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: payload.user_id, session_id: payload.session_id});

        // 7. 새 refresh insert (chain)
        const newRefreshEntity = new SessionRefreshEntity();
        newRefreshEntity.session_id = payload.session_id;
        newRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        newRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        newRefreshEntity.before_refresh_hash = refresh_hash;
        newRefreshEntity.end_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(newRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
        };
    }

    /**
     * 회원 탈퇴 신청 — ACTIVE/BLOCK 회원을 LEAVE_WAIT 로 전환하고 14일 뒤 예약시각 지정. (RabbitMQ: user.member.leave)
     * 미존재 → 404, 이미 LEAVE_WAIT/LEAVE → 400. 직전 상태는 leave_prev_state_id 로 스냅샷(철회 복원용).
     *
     * @param user_id 로그인 회원 ID
     * @param dto 탈퇴 사유
     */
    @Transactional()
    async leave(user_id: string, dto: UserLeaveDto): Promise<void> {
        const user = await this.userRepository.findUser({user_id});
        if (!user) {
            throw new NotFoundException({message: '일치하는 회원이 없습니다.'});
        }
        if (user.state_id !== 'ACTIVE' && user.state_id !== 'BLOCK') {
            throw new BadRequestException({message: '탈퇴를 신청할 수 없는 상태입니다.'});
        }

        const entity = new UserEntity();
        entity.state_id = 'LEAVE_WAIT';
        entity.leave_prev_state_id = user.state_id;
        entity.leave_comment = dto.leave_comment ?? null;
        entity.leave_reserved_at = dayjs().add(14, 'day').format('YYYY-MM-DD HH:mm:ss');
        await this.userRepository.updateUser({user_id}, entity);
    }

    /**
     * 회원 탈퇴 철회 — LEAVE_WAIT 회원을 직전 상태(없으면 ACTIVE)로 복원하고 예약/스냅샷 초기화. (RabbitMQ: user.member.leave-cancel)
     * 미존재 → 404, LEAVE_WAIT 아님 → 400.
     *
     * @param user_id 로그인 회원 ID
     */
    @Transactional()
    async cancelLeave(user_id: string): Promise<void> {
        const user = await this.userRepository.findUser({user_id});
        if (!user) {
            throw new NotFoundException({message: '일치하는 회원이 없습니다.'});
        }
        if (user.state_id !== 'LEAVE_WAIT') {
            throw new BadRequestException({message: '탈퇴 철회를 할 수 없는 상태입니다.'});
        }

        const entity = new UserEntity();
        entity.state_id = user.leave_prev_state_id ?? 'ACTIVE';
        entity.leave_reserved_at = null;
        entity.leave_prev_state_id = null;
        entity.leave_comment = null;
        await this.userRepository.updateUser({user_id}, entity);
    }

    /**
     * 비밀번호 변경 — 로그인 회원 공용. 성공 시 변경 필요 플래그를 함께 내린다. (RabbitMQ: user.member.password)
     *
     * @param user_id 로그인 회원 ID
     * @param dto 현재 · 새 비밀번호
     */
    @Transactional()
    async changePassword(user_id: string, dto: UserPasswordDto): Promise<void> {
        // 1. 대상 조회
        const user = await this.userRepository.findUser({user_id});
        if (!user) {
            throw new NotFoundException({message: '회원 정보를 찾을 수 없습니다.'});
        }

        // 2. 현재 비밀번호 검증
        const matched = await matchBcrypt(dto.current_password, user.login_pw);
        if (!matched) {
            throw new BadRequestException({message: '현재 비밀번호가 일치하지 않습니다.'});
        }

        // 3. 동일 비밀번호 차단
        const same = await matchBcrypt(dto.new_password, user.login_pw);
        if (same) {
            throw new BadRequestException({message: '기존 비밀번호와 다른 비밀번호를 입력해주세요.'});
        }

        // 4. 변경 + 플래그 해제
        const userEntity = new UserEntity();
        userEntity.login_pw = await getBcrypt(dto.new_password);
        userEntity.is_password_change_required = 0;
        await this.userRepository.updateUser({user_id}, userEntity);
    }

    /**
     * 로그인 회원 조회 — 게이트웨이 JWT 전략이 매 인증 요청마다 호출한다. (내부 HTTP: GET /internal/v1/user/auth-user/:user_id)
     * 로그인 가능 상태(is_login_able = 1)이고 회원 설정이 있는 회원만 돌려준다.
     *
     * @param user_id 토큰의 회원 ID
     * @returns 로그인 회원 정보
     */
    async getLoginUser(user_id: string): Promise<UserAuthUserResultDto> {
        const row = await this.userRepository.findLoginUser(user_id);
        if (!row) {
            throw new NotFoundException({message: '로그인 정보를 찾을 수 없습니다.'});
        }
        return toUserAuthUserResult(row);
    }
}
