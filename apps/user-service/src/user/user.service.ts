import {BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {Transactional} from '@nestjs-cls/transactional';
import dayjs from 'dayjs';
import {In, MoreThanOrEqual} from 'typeorm';
import {getBcrypt, matchBcrypt} from '@app/common/utils/bcrypt.js';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {UserAuthUserResultDto} from '@app/contracts/user/dto/user-auth-user.dto.js';
import type {UserFindLoginIdConfirmDto, UserFindLoginIdConfirmResultDto} from '@app/contracts/user/dto/user-find-login-id-confirm.dto.js';
import type {UserFindLoginIdDto, UserFindLoginIdResultDto} from '@app/contracts/user/dto/user-find-login-id.dto.js';
import type {UserGeneralLoginDto, UserGeneralLoginResultDto} from '@app/contracts/user/dto/user-general-login.dto.js';
import type {UserGeneralSignDto, UserGeneralSignResultDto} from '@app/contracts/user/dto/user-general-sign.dto.js';
import type {UserLeaveDto} from '@app/contracts/user/dto/user-leave.dto.js';
import type {UserLoginDto, UserLoginResultDto} from '@app/contracts/user/dto/user-login.dto.js';
import type {UserPasswordResetConfirmDto} from '@app/contracts/user/dto/user-password-reset-confirm.dto.js';
import type {UserPasswordResetDto, UserPasswordResetResultDto} from '@app/contracts/user/dto/user-password-reset.dto.js';
import type {UserPasswordDto} from '@app/contracts/user/dto/user-password.dto.js';
import type {UserPhoneVerificationConfirmDto} from '@app/contracts/user/dto/user-phone-verification-confirm.dto.js';
import type {UserPhoneVerificationDto, UserPhoneVerificationResultDto} from '@app/contracts/user/dto/user-phone-verification.dto.js';
import type {UserSignDto, UserSignResultDto} from '@app/contracts/user/dto/user-sign.dto.js';
import type {UserTokenRefreshDto, UserTokenRefreshResultDto} from '@app/contracts/user/dto/user-token-refresh.dto.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import {UserSettingEntity} from '@app/database/entities/user/user-setting.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {SMS_SENDER} from '@app/integration/integration.symbols.js';
import type {SmsSenderInterface} from '@app/integration/interfaces/integration.interface.js';
import type {UserRepositoryInterface} from './interfaces/user.repository.interface.js';
import {
    ACCOUNT_NOT_FOUND_MESSAGE,
    ACCOUNT_RECOVERY_STATES,
    BLOCKED_ACCOUNT_MESSAGE,
    INVALID_LOGIN_MESSAGE,
    INVALID_TOKEN_MESSAGE,
    NO_MATCHING_USER_MESSAGE,
    PHONE_ALREADY_VERIFIED_MESSAGE,
    PHONE_TAKEN_MESSAGE,
    SMS_ATTEMPTS_EXCEEDED_MESSAGE,
    SMS_CODE_MISMATCH_MESSAGE,
    SMS_DAILY_LIMIT_MESSAGE,
    SMS_MAX_ATTEMPTS,
    SMS_PURPOSE,
    SMS_STATE_MESSAGE,
    SMS_VERIFICATION_NOT_FOUND_MESSAGE,
    UNDERAGE_MESSAGE,
    USER_NOT_FOUND_MESSAGE,
} from './user.constants.js';
import {USER_REPOSITORY} from './user.symbols.js';
import {
    buildSmsVerification,
    checkSmsVerification,
    generateId,
    generateSnsLoginId,
    generateTemporaryPassword,
    generateVerificationCode,
    getSmsDailyLimit,
    isAdult,
    issueAccessAndRefresh,
    kstDayStart,
    smsVerificationText,
    temporaryPasswordText,
    toUserAuthUserResult,
} from './user.util.js';

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
     * @param smsSender SMS 발송 포트 (Amazon SNS)
     */
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: UserRepositoryInterface,
        private readonly jwtService: JwtService,
        @Inject(SMS_SENDER)
        private readonly smsSender: SmsSenderInterface,
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
        sessionEntity.is_deleted = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 6. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id, session_id});

        // 7. t_session_refresh 생성
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.previous_refresh_hash = null;
        sessionRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_phone_verified: 0,
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
        sessionEntity.is_deleted = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 6. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id, session_id});

        // 7. t_session_refresh 생성
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.previous_refresh_hash = null;
        sessionRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_phone_verified: 0,
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
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 2. BLOCK 차단
        if (user.state_id === 'BLOCK') {
            throw new HttpException({message: BLOCKED_ACCOUNT_MESSAGE, block_comment: user.block_comment}, HttpStatus.FORBIDDEN);
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
        sessionEntity.is_deleted = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 5. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: user.user_id, session_id});

        // 6. refresh 저장
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.previous_refresh_hash = null;
        sessionRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_phone_verified: user.phone_verified_at ? 1 : 0,
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
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 2. 비밀번호 검증 — 실패 시 미존재와 동일 404
        const matched = await matchBcrypt(dto.login_pw, user.login_pw);
        if (!matched) {
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 3. BLOCK 차단 (비밀번호 검증 후)
        if (user.state_id === 'BLOCK') {
            throw new HttpException({message: BLOCKED_ACCOUNT_MESSAGE, block_comment: user.block_comment}, HttpStatus.FORBIDDEN);
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
        sessionEntity.is_deleted = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 6. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: user.user_id, session_id});

        // 7. refresh 저장
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.previous_refresh_hash = null;
        sessionRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;
        await this.userRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_password_change_required: user.is_password_change_required,
            is_phone_verified: user.phone_verified_at ? 1 : 0,
        };
    }

    /**
     * 로그인 토큰 재발급 (내부 HTTP: POST /internal/v1/user/token-refresh)
     * - 서명 · 만료 · payload type 검증 실패 → 401
     * - refresh_hash 로 t_session_refresh 조회, 미존재 · DB expires_at 경과 → 401
     * - 세션 미존재 · 로그인 시점 ip 와 요청 ip 불일치 → 401 (어느 한쪽 ip 가 없으면 비교 생략)
     * - 회원이 ACTIVE 가 아니면 401 + 안전망으로 expires_at 단축
     * - old refresh expires_at = now + 1m 단축(grace) 후 새 토큰 발급, previous_refresh_hash 로 체인 연결
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
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }
        if (payload.type !== 'refresh') {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 2. DB 조회 (refresh_hash) + DB expires_at 만료 확인 (chain 재사용 차단)
        const refresh_hash = sha256Hex(dto.refresh_token);
        const oldRefresh = await this.userRepository.findSessionRefresh({refresh_hash});
        if (!oldRefresh) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }
        if (oldRefresh.expires_at.getTime() < Date.now()) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 3. 세션 ip 체크 — 로그인 시점 저장 ip 와 불일치 시 거부(만료 단축 없음)
        const session = await this.userRepository.findSession({session_id: payload.session_id});
        if (!session) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }
        if (session.ip && ip && session.ip !== ip) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 4. 회원 state 재검증 — 안전망: expires_at 단축
        const user = await this.userRepository.findUser({user_id: payload.user_id});
        if (!user || user.state_id !== 'ACTIVE') {
            const expireEntity = new SessionRefreshEntity();
            expireEntity.expires_at = dayjs().add(1, 'minute').toDate();
            await this.userRepository.updateSessionRefresh({refresh_hash}, expireEntity);
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 5. old refresh 단축 (1분 후 만료)
        const shrinkEntity = new SessionRefreshEntity();
        shrinkEntity.expires_at = dayjs().add(1, 'minute').toDate();
        await this.userRepository.updateSessionRefresh({refresh_hash}, shrinkEntity);

        // 6. 새 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: payload.user_id, session_id: payload.session_id});

        // 7. 새 refresh insert (chain)
        const newRefreshEntity = new SessionRefreshEntity();
        newRefreshEntity.session_id = payload.session_id;
        newRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        newRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        newRefreshEntity.previous_refresh_hash = refresh_hash;
        newRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;
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
     * 미존재 → 404, 이미 LEAVE_WAIT/LEAVE → 400. 직전 상태는 leave_previous_state_id 로 스냅샷(철회 복원용).
     *
     * @param user_id 로그인 회원 ID
     * @param dto 탈퇴 사유
     */
    @Transactional()
    async leave(user_id: string, dto: UserLeaveDto): Promise<void> {
        const user = await this.userRepository.findUser({user_id});
        if (!user) {
            throw new NotFoundException({message: NO_MATCHING_USER_MESSAGE});
        }
        if (user.state_id !== 'ACTIVE' && user.state_id !== 'BLOCK') {
            throw new BadRequestException({message: '탈퇴를 신청할 수 없는 상태입니다.'});
        }

        const entity = new UserEntity();
        entity.state_id = 'LEAVE_WAIT';
        entity.leave_previous_state_id = user.state_id;
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
            throw new NotFoundException({message: NO_MATCHING_USER_MESSAGE});
        }
        if (user.state_id !== 'LEAVE_WAIT') {
            throw new BadRequestException({message: '탈퇴 철회를 할 수 없는 상태입니다.'});
        }

        const entity = new UserEntity();
        entity.state_id = user.leave_previous_state_id ?? 'ACTIVE';
        entity.leave_reserved_at = null;
        entity.leave_previous_state_id = null;
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
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
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
     * 로그인 가능 상태(is_login_allowed = 1)이고 회원 설정이 있는 회원만 돌려준다.
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

    /**
     * 휴대폰 인증번호 발송 — 가입 후 본인 휴대폰 인증(SNS · 일반 공통). (RabbitMQ: user.member.phone-verification)
     * 번호 1개 = 계정 1개, 같은 번호 하루 발송 한도(SMS_VERIFICATION_DAILY_LIMIT). SMS 발송은 마지막 단계.
     *
     * @param user_id 로그인 회원 ID
     * @param dto 휴대폰 번호
     * @param ip 클라이언트 IP
     * @returns 인증 ID · 만료 시각 (확인은 인증 ID + 인증번호)
     */
    @Transactional()
    async sendPhoneVerification(user_id: string, dto: UserPhoneVerificationDto, ip: string): Promise<UserPhoneVerificationResultDto> {
        // 1. 회원 — 이미 인증했으면 다시 할 수 없다
        const user = await this.userRepository.findUser({user_id});
        if (!user) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }
        if (user.phone_verified_at) {
            throw new BadRequestException({message: PHONE_ALREADY_VERIFIED_MESSAGE});
        }

        // 2. 번호 1개 = 계정 1개 — 다른 계정이 인증한 번호는 거부
        const owner = await this.userRepository.findUser({phone: dto.phone});
        if (owner) {
            throw new BadRequestException({message: PHONE_TAKEN_MESSAGE, validation_errors: createValidationError('phone', PHONE_TAKEN_MESSAGE)});
        }

        // 3. 같은 번호 하루 발송 한도 (한국 날짜)
        const now = new Date();
        const sentToday = await this.userRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(kstDayStart(now))});
        if (sentToday >= getSmsDailyLimit()) {
            throw new HttpException({message: SMS_DAILY_LIMIT_MESSAGE}, HttpStatus.TOO_MANY_REQUESTS);
        }

        // 4. 발송 기록 → SMS 발송(마지막)
        const code = generateVerificationCode();
        const verification = buildSmsVerification({sms_purpose_id: SMS_PURPOSE.PHONE_VERIFY, user_id, phone: dto.phone, code, ip, now});
        await this.userRepository.insertSmsVerification(verification);
        await this.smsSender.send({to: dto.phone, text: smsVerificationText(code)});
        return {sms_verification_id: verification.sms_verification_id, expires_at: verification.expires_at.toISOString()};
    }

    /**
     * 휴대폰 인증번호 확인 — 발송 결과의 인증 ID + 인증번호. 확인되면 그 기록의 번호를 회원정보에 저장한다. (RabbitMQ: user.member.phone-verification-confirm)
     * 시도 횟수는 비교 전에 같은 트랜잭션에서 소비한다(최대 3회). 불일치는 예외를 throw 하지 않고 return 한다 —
     * 트랜잭션이 커밋돼 소비한 횟수가 남고, CommandDispatcher 가 반환된 예외를 failed(400)로 회신한다.
     *
     * @param user_id 로그인 회원 ID
     * @param dto 인증 ID · 인증번호
     * @returns 없음 — 불일치면 BadRequestException(반환, 커밋 뒤 실패)
     */
    @Transactional()
    async confirmPhoneVerification(user_id: string, dto: UserPhoneVerificationConfirmDto): Promise<void | BadRequestException> {
        // 1. 회원 — 이미 인증했으면 다시 할 수 없다
        const user = await this.userRepository.findUser({user_id});
        if (!user) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }
        if (user.phone_verified_at) {
            throw new BadRequestException({message: PHONE_ALREADY_VERIFIED_MESSAGE});
        }

        // 2. 인증 기록 — 본인 · 휴대폰 인증 용도만. 사용함 · 만료
        const now = new Date();
        const verification = await this.userRepository.findSmsVerification({sms_verification_id: dto.sms_verification_id, sms_purpose_id: SMS_PURPOSE.PHONE_VERIFY, user_id});
        if (!verification) {
            throw new NotFoundException({message: SMS_VERIFICATION_NOT_FOUND_MESSAGE});
        }
        const state = checkSmsVerification(verification, now);
        if (state !== 'USABLE') {
            throw new BadRequestException({message: SMS_STATE_MESSAGE[state]});
        }

        // 3. 시도 1회 소비 → 인증번호 비교 (불일치는 return — 소비한 횟수를 커밋한다)
        const consumed = await this.userRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            return new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // 4. 인증 완료 + 회원정보에 그 기록의 번호 저장 (다른 계정과 경쟁하면 UK_User_Phone → 400)
        const verifiedEntity = new SmsVerificationEntity();
        verifiedEntity.verified_at = now;
        await this.userRepository.updateSmsVerification({sms_verification_id: verification.sms_verification_id}, verifiedEntity);

        const userEntity = new UserEntity();
        userEntity.phone = verification.phone;
        userEntity.phone_verified_at = now;
        await this.userRepository.updateUser({user_id}, userEntity);
    }

    /**
     * 아이디 찾기 — 인증번호 발송. 그 번호로 인증한 회원이 있을 때만 보낸다. (RabbitMQ: user.member.find-login-id)
     *
     * @param dto 휴대폰 번호
     * @param ip 클라이언트 IP
     * @returns 인증 ID · 만료 시각 (확인은 인증 ID + 인증번호)
     */
    @Transactional()
    async sendFindLoginId(dto: UserFindLoginIdDto, ip: string): Promise<UserFindLoginIdResultDto> {
        // 1. 그 번호로 인증한 회원 (탈퇴 완료 제외)
        const user = await this.userRepository.findUser({phone: dto.phone, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!user) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 2. 같은 번호 하루 발송 한도 (한국 날짜)
        const now = new Date();
        const sentToday = await this.userRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(kstDayStart(now))});
        if (sentToday >= getSmsDailyLimit()) {
            throw new HttpException({message: SMS_DAILY_LIMIT_MESSAGE}, HttpStatus.TOO_MANY_REQUESTS);
        }

        // 3. 발송 기록 → SMS 발송(마지막)
        const code = generateVerificationCode();
        const verification = buildSmsVerification({sms_purpose_id: SMS_PURPOSE.FIND_LOGIN_ID, user_id: user.user_id, phone: dto.phone, code, ip, now});
        await this.userRepository.insertSmsVerification(verification);
        await this.smsSender.send({to: dto.phone, text: smsVerificationText(code)});
        return {sms_verification_id: verification.sms_verification_id, expires_at: verification.expires_at.toISOString()};
    }

    /**
     * 아이디 찾기 — 인증 ID + 인증번호 확인 → 일반 계정은 login_id, SNS 계정은 sns_id, 그리고 가입일시. (RabbitMQ: user.member.find-login-id-confirm)
     * 불일치는 예외를 return 한다 — 소비한 시도 횟수를 커밋하고 CommandDispatcher 가 failed(400)로 회신한다.
     *
     * @param dto 인증 ID · 인증번호
     * @returns 아이디 또는 가입한 SNS · 가입일시 — 불일치면 BadRequestException(반환, 커밋 뒤 실패)
     */
    @Transactional()
    async confirmFindLoginId(dto: UserFindLoginIdConfirmDto): Promise<UserFindLoginIdConfirmResultDto | BadRequestException> {
        // 1. 인증 기록 — 아이디 찾기 용도만. 사용함 · 만료
        const now = new Date();
        const verification = await this.userRepository.findSmsVerification({sms_verification_id: dto.sms_verification_id, sms_purpose_id: SMS_PURPOSE.FIND_LOGIN_ID});
        if (!verification) {
            throw new NotFoundException({message: SMS_VERIFICATION_NOT_FOUND_MESSAGE});
        }
        const state = checkSmsVerification(verification, now);
        if (state !== 'USABLE') {
            throw new BadRequestException({message: SMS_STATE_MESSAGE[state]});
        }

        // 2. 그 기록의 회원 (탈퇴 완료 제외)
        const user = await this.userRepository.findUser({user_id: verification.user_id, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!user) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 3. 시도 1회 소비 → 인증번호 비교 (불일치는 return — 소비한 횟수를 커밋한다)
        const consumed = await this.userRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            return new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // 4. 인증 완료 → 결과 (SNS 계정은 자동 생성 아이디 대신 가입한 SNS)
        const verifiedEntity = new SmsVerificationEntity();
        verifiedEntity.verified_at = now;
        await this.userRepository.updateSmsVerification({sms_verification_id: verification.sms_verification_id}, verifiedEntity);
        return {login_id: user.sns_id ? null : user.login_id, sns_id: user.sns_id, created_at: user.created_at.toISOString()};
    }

    /**
     * 비밀번호 초기화 — 인증번호 발송. 아이디 + 휴대폰 번호가 같은 일반 계정일 때만 보낸다. (RabbitMQ: user.member.password-reset)
     *
     * @param dto 아이디 · 휴대폰 번호
     * @param ip 클라이언트 IP
     * @returns 인증 ID · 만료 시각 (확인은 인증 ID + 인증번호)
     */
    @Transactional()
    async sendPasswordReset(dto: UserPasswordResetDto, ip: string): Promise<UserPasswordResetResultDto> {
        // 1. 아이디 + 번호가 같은 회원 — SNS 계정은 비밀번호가 없다
        const user = await this.userRepository.findUser({login_id: dto.login_id, phone: dto.phone, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!user) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }
        if (user.sns_id) {
            throw new BadRequestException({message: 'SNS로 가입한 계정은 비밀번호를 초기화할 수 없습니다. 가입한 SNS로 로그인해주세요.'});
        }

        // 2. 같은 번호 하루 발송 한도 (한국 날짜)
        const now = new Date();
        const sentToday = await this.userRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(kstDayStart(now))});
        if (sentToday >= getSmsDailyLimit()) {
            throw new HttpException({message: SMS_DAILY_LIMIT_MESSAGE}, HttpStatus.TOO_MANY_REQUESTS);
        }

        // 3. 발송 기록 → SMS 발송(마지막)
        const code = generateVerificationCode();
        const verification = buildSmsVerification({sms_purpose_id: SMS_PURPOSE.PASSWORD_RESET, user_id: user.user_id, phone: dto.phone, code, ip, now});
        await this.userRepository.insertSmsVerification(verification);
        await this.smsSender.send({to: dto.phone, text: smsVerificationText(code)});
        return {sms_verification_id: verification.sms_verification_id, expires_at: verification.expires_at.toISOString()};
    }

    /**
     * 비밀번호 초기화 — 인증 ID + 인증번호 확인 → 임시 비밀번호(영문 + 숫자 10자리)로 바꾸고 그 기록의 번호로 SMS 를 보낸다. (RabbitMQ: user.member.password-reset-confirm)
     * 다음 로그인 때 비밀번호 변경이 필요하다는 표시(is_password_change_required = 1)를 남긴다. SMS 발송은 마지막 단계.
     * 불일치는 예외를 return 한다(소비한 시도 횟수 커밋). SMS 실패(503)는 throw — 비밀번호 변경과 시도 소비가 함께 롤백되고 재시도된다.
     *
     * @param dto 인증 ID · 인증번호
     * @returns 없음 — 불일치면 BadRequestException(반환, 커밋 뒤 실패)
     */
    @Transactional()
    async confirmPasswordReset(dto: UserPasswordResetConfirmDto): Promise<void | BadRequestException> {
        // 1. 인증 기록 — 비밀번호 초기화 용도만. 사용함 · 만료
        const now = new Date();
        const verification = await this.userRepository.findSmsVerification({sms_verification_id: dto.sms_verification_id, sms_purpose_id: SMS_PURPOSE.PASSWORD_RESET});
        if (!verification) {
            throw new NotFoundException({message: SMS_VERIFICATION_NOT_FOUND_MESSAGE});
        }
        const state = checkSmsVerification(verification, now);
        if (state !== 'USABLE') {
            throw new BadRequestException({message: SMS_STATE_MESSAGE[state]});
        }

        // 2. 그 기록의 회원 (탈퇴 완료 제외)
        const user = await this.userRepository.findUser({user_id: verification.user_id, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!user) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 3. 시도 1회 소비 → 인증번호 비교 (불일치는 return — 소비한 횟수를 커밋한다)
        const consumed = await this.userRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            return new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // 4. 인증 완료 → 임시 비밀번호로 교체 + 변경 필요 표시 → SMS 발송(마지막)
        const verifiedEntity = new SmsVerificationEntity();
        verifiedEntity.verified_at = now;
        await this.userRepository.updateSmsVerification({sms_verification_id: verification.sms_verification_id}, verifiedEntity);

        const temporaryPassword = generateTemporaryPassword();
        const userEntity = new UserEntity();
        userEntity.login_pw = await getBcrypt(temporaryPassword);
        userEntity.is_password_change_required = 1;
        await this.userRepository.updateUser({user_id: user.user_id}, userEntity);
        await this.smsSender.send({to: verification.phone, text: temporaryPasswordText(temporaryPassword)});
    }
}
