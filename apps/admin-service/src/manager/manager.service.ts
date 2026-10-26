import {BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {Transactional} from '@nestjs-cls/transactional';
import dayjs from 'dayjs';
import {In, MoreThanOrEqual, Not} from 'typeorm';
import {
    ACCOUNT_NOT_FOUND_MESSAGE,
    ACCOUNT_RECOVERY_STATES,
    BLOCKED_ACCOUNT_MESSAGE,
    INVALID_LOGIN_MESSAGE,
    INVALID_TOKEN_MESSAGE,
    SMS_ATTEMPTS_EXCEEDED_MESSAGE,
    SMS_CODE_MISMATCH_MESSAGE,
    SMS_DAILY_LIMIT_MESSAGE,
    SMS_MAX_ATTEMPTS,
    SMS_PURPOSE,
    SMS_STATE_MESSAGE,
    SMS_VERIFICATION_NOT_FOUND_MESSAGE,
    USER_NOT_FOUND_MESSAGE,
} from '@app/account/account.constants.js';
import {generateTemporaryPassword, temporaryPasswordText} from '@app/account/utils/password.js';
import {buildSmsVerification, checkSmsVerification, generateVerificationCode, getSmsDailyLimit, smsVerificationText} from '@app/account/utils/sms-verification.js';
import {issueAccessAndRefresh} from '@app/account/utils/token.js';
import {getBcrypt, matchBcrypt} from '@app/common/utils/bcrypt.js';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {generateId} from '@app/common/utils/id.js';
import {kstDayStart} from '@app/common/utils/kst.js';
import {Pagination} from '@app/common/utils/pagination.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {ManagerAuthUserResultDto} from '@app/contracts/manager/dto/manager-auth-user.dto.js';
import type {ManagerFindLoginIdConfirmDto, ManagerFindLoginIdConfirmResultDto} from '@app/contracts/manager/dto/manager-find-login-id-confirm.dto.js';
import type {ManagerFindLoginIdDto, ManagerFindLoginIdResultDto} from '@app/contracts/manager/dto/manager-find-login-id.dto.js';
import type {ManagerLoginDto, ManagerLoginResultDto} from '@app/contracts/manager/dto/manager-login.dto.js';
import type {ManagerPasswordResetConfirmDto} from '@app/contracts/manager/dto/manager-password-reset-confirm.dto.js';
import type {ManagerPasswordResetDto, ManagerPasswordResetResultDto} from '@app/contracts/manager/dto/manager-password-reset.dto.js';
import type {ManagerPasswordDto} from '@app/contracts/manager/dto/manager-password.dto.js';
import type {ManagerStaffDetailResultDto} from '@app/contracts/manager/dto/manager-staff-detail.dto.js';
import type {ManagerStaffListDto, ManagerStaffListResultDto} from '@app/contracts/manager/dto/manager-staff-list.dto.js';
import type {ManagerStaffStateDto} from '@app/contracts/manager/dto/manager-staff-state.dto.js';
import type {ManagerStaffUpdateDto} from '@app/contracts/manager/dto/manager-staff-update.dto.js';
import type {ManagerStaffDto, ManagerStaffResultDto} from '@app/contracts/manager/dto/manager-staff.dto.js';
import type {ManagerTokenRefreshDto, ManagerTokenRefreshResultDto} from '@app/contracts/manager/dto/manager-token-refresh.dto.js';
import {AUTH_ID, LOGIN_SCOPE} from '@app/contracts/roles.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {SMS_SENDER} from '@app/integration/integration.symbols.js';
import type {SmsSenderInterface} from '@app/integration/interfaces/integration.interface.js';
import type {ManagerRepositoryInterface} from './interfaces/manager.repository.interface.js';
import {MANAGER_STORE_NOT_FOUND_MESSAGE, STAFF_LOGIN_ID_TAKEN_MESSAGE, STAFF_NOT_FOUND_MESSAGE, STAFF_PHONE_TAKEN_MESSAGE, STAFF_STATES} from './manager.constants.js';
import {MANAGER_REPOSITORY} from './manager.symbols.js';
import {buildStaffListWhere, staffRegisteredText, toManagerAuthUserResult, toStaffDetail, toStaffListItem} from './manager.util.js';

/**
 * 매니저 도메인 비즈니스 로직 (헥사고날의 안쪽) — 매니저 로그인 그룹(총매니저 HEAD_MANAGER · 매니저 MANAGER)만 다룬다.
 * 다른 그룹 계정은 조회 조건(login_scope = MANAGER)에서 걸러져 없는 계정과 같다. 매니저 계정은 업체 안에서만 유일해 로그인 · 계정 찾기는 업체코드로 업체를 먼저 찾는다.
 * 업체 관리자 계정 관리는 업체 총관리자만 부른다(게이트웨이 RolesGuard) — service 는 actor 로 업체 총관리자를 다시 찾아 그 업체만 다룬다.
 * 내부 HTTP 컨트롤러와 RabbitMQ 핸들러가 같은 메서드를 호출한다. public 메서드 1개 = API 1개.
 */
@Injectable()
export class ManagerService {
    /**
     * @param managerRepository 매니저 repository 포트
     * @param jwtService 토큰 서명기
     * @param smsSender SMS 발송 포트 (Amazon SNS)
     */
    constructor(
        @Inject(MANAGER_REPOSITORY)
        private readonly managerRepository: ManagerRepositoryInterface,
        private readonly jwtService: JwtService,
        @Inject(SMS_SENDER)
        private readonly smsSender: SmsSenderInterface,
    ) {}

    /**
     * 매니저 로그인 (내부 HTTP: POST /internal/v1/admin-service/manager/login)
     * - 업체코드로 업체를 찾는다 — 없으면 계정이 없는 것과 같은 404(업체 존재를 드러내지 않는다). 매니저 계정은 업체 안에서만 유일하다
     * - 그 업체에서 login_id + 매니저 그룹 + state_id IN (ACTIVE, BLOCK) 조회 → 미존재(다른 그룹 · 다른 업체 포함) 404
     * - 비밀번호 불일치 → 동일 404 (아이디/비밀번호 구분 비노출)
     * - BLOCK → 403 + block_comment (비밀번호 검증 후 판정 — 비밀번호 없이 정지 여부 탐지 방지)
     *
     * @param dto 로그인 정보
     * @param ip 클라이언트 IP
     * @returns 토큰 4종 + 비밀번호 변경 필요 여부 + 권한 · 소속 업체
     */
    @Transactional()
    async login(dto: ManagerLoginDto, ip: string): Promise<ManagerLoginResultDto> {
        // 1. 업체코드 → 업체
        const store = await this.managerRepository.findManagerStore({store_code: dto.store_code});
        if (!store) {
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 2. 그 업체의 매니저 조회 (ACTIVE / BLOCK 만)
        const manager = await this.managerRepository.findManager({login_id: dto.login_id, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id, state_id: In(['ACTIVE', 'BLOCK'])});
        if (!manager) {
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 3. 비밀번호 검증 — 실패 시 미존재와 동일 404
        const matched = await matchBcrypt(dto.login_pw, manager.login_pw);
        if (!matched) {
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 4. BLOCK 차단 (비밀번호 검증 후)
        if (manager.state_id === 'BLOCK') {
            throw new HttpException({message: BLOCKED_ACCOUNT_MESSAGE, block_comment: manager.block_comment}, HttpStatus.FORBIDDEN);
        }

        // 5. device 정보 입력 시 t_user 동기화
        if (dto.device_os && dto.device_token) {
            const deviceEntity = new UserEntity();
            deviceEntity.device_os = dto.device_os;
            deviceEntity.device_token = dto.device_token;
            await this.managerRepository.updateManager({user_id: manager.user_id}, deviceEntity);
        }

        // 6. session 생성
        const session_id = generateId();
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = manager.user_id;
        sessionEntity.ip = ip || null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_deleted = 0;
        await this.managerRepository.insertSession(sessionEntity);

        // 7. 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: manager.user_id, session_id});

        // 8. refresh 저장
        const sessionRefreshEntity = new SessionRefreshEntity();
        sessionRefreshEntity.session_id = session_id;
        sessionRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        sessionRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        sessionRefreshEntity.previous_refresh_hash = null;
        sessionRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;
        await this.managerRepository.insertSessionRefresh(sessionRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_password_change_required: manager.is_password_change_required,
            auth_id: manager.auth_id,
            store_id: manager.store_id ?? null,
        };
    }

    /**
     * 매니저 토큰 재발급 (내부 HTTP: POST /internal/v1/admin-service/manager/token-refresh)
     * - 서명 · 만료 · payload type 검증 실패 → 401
     * - refresh_hash 로 t_session_refresh 조회, 미존재 · DB expires_at 경과 → 401
     * - 세션 미존재 · 로그인 시점 ip 와 요청 ip 불일치 → 401 (어느 한쪽 ip 가 없으면 비교 생략)
     * - 회원이 ACTIVE 가 아니거나 매니저 그룹이 아니면 401 + 안전망으로 expires_at 단축
     * - old refresh expires_at = now + 1m 단축(grace) 후 새 토큰 발급, previous_refresh_hash 로 체인 연결
     *
     * @param dto refresh token
     * @param ip 클라이언트 IP
     * @returns 토큰 4종
     */
    @Transactional()
    async tokenRefresh(dto: ManagerTokenRefreshDto, ip: string): Promise<ManagerTokenRefreshResultDto> {
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
        const oldRefresh = await this.managerRepository.findSessionRefresh({refresh_hash});
        if (!oldRefresh) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }
        if (oldRefresh.expires_at.getTime() < Date.now()) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 3. 세션 ip 체크 — 로그인 시점 저장 ip 와 불일치 시 거부(만료 단축 없음)
        const session = await this.managerRepository.findSession({session_id: payload.session_id});
        if (!session) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }
        if (session.ip && ip && session.ip !== ip) {
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 4. 회원 state · 매니저 그룹 재검증 — 안전망: expires_at 단축
        const manager = await this.managerRepository.findManager({user_id: payload.user_id});
        if (!manager || manager.state_id !== 'ACTIVE' || manager.login_scope !== LOGIN_SCOPE.MANAGER) {
            const expireEntity = new SessionRefreshEntity();
            expireEntity.expires_at = dayjs().add(1, 'minute').toDate();
            await this.managerRepository.updateSessionRefresh({refresh_hash}, expireEntity);
            throw new UnauthorizedException({message: INVALID_TOKEN_MESSAGE});
        }

        // 5. old refresh 단축 (1분 후 만료)
        const shrinkEntity = new SessionRefreshEntity();
        shrinkEntity.expires_at = dayjs().add(1, 'minute').toDate();
        await this.managerRepository.updateSessionRefresh({refresh_hash}, shrinkEntity);

        // 6. 새 토큰 발급
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: payload.user_id, session_id: payload.session_id});

        // 7. 새 refresh insert (chain)
        const newRefreshEntity = new SessionRefreshEntity();
        newRefreshEntity.session_id = payload.session_id;
        newRefreshEntity.refresh_hash = sha256Hex(tokens.refreshToken);
        newRefreshEntity.refresh_encrypted = encryptAesGcm(tokens.refreshToken);
        newRefreshEntity.previous_refresh_hash = refresh_hash;
        newRefreshEntity.expires_at = tokens.refreshTokenExpiresAt;
        await this.managerRepository.insertSessionRefresh(newRefreshEntity);

        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
        };
    }

    /**
     * 로그인 매니저 조회 — 게이트웨이 jwt-manager 전략이 매 인증 요청마다 호출한다. (내부 HTTP: GET /internal/v1/admin-service/manager/auth-user/:user_id)
     * 매니저 그룹이고 로그인 가능 상태(is_login_allowed = 1)인 회원만 돌려준다 — 다른 그룹 토큰은 여기서 404(게이트웨이 401).
     *
     * @param user_id 토큰의 회원 ID
     * @returns 로그인 매니저 정보
     */
    async getLoginManager(user_id: string): Promise<ManagerAuthUserResultDto> {
        const row = await this.managerRepository.findLoginManager(user_id);
        if (!row) {
            throw new NotFoundException({message: '로그인 정보를 찾을 수 없습니다.'});
        }
        return toManagerAuthUserResult(row);
    }

    /**
     * 매니저 비밀번호 변경 — 성공 시 변경 필요 플래그를 함께 내린다. (RabbitMQ: admin.manager.password)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 현재 · 새 비밀번호
     */
    @Transactional()
    async changePassword(user_id: string, dto: ManagerPasswordDto): Promise<void> {
        // 1. 대상 조회 (매니저 그룹만)
        const manager = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER});
        if (!manager) {
            throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
        }

        // 2. 현재 비밀번호 검증
        const matched = await matchBcrypt(dto.current_password, manager.login_pw);
        if (!matched) {
            throw new BadRequestException({message: '현재 비밀번호가 일치하지 않습니다.'});
        }

        // 3. 동일 비밀번호 차단
        const same = await matchBcrypt(dto.new_password, manager.login_pw);
        if (same) {
            throw new BadRequestException({message: '기존 비밀번호와 다른 비밀번호를 입력해주세요.'});
        }

        // 4. 변경 + 플래그 해제
        const managerEntity = new UserEntity();
        managerEntity.login_pw = await getBcrypt(dto.new_password);
        managerEntity.is_password_change_required = 0;
        await this.managerRepository.updateManager({user_id}, managerEntity);
    }

    /**
     * 매니저 아이디 찾기 — 인증번호 발송. 업체코드의 업체에 그 번호가 등록된 매니저가 있을 때만 보낸다(업체코드가 없으면 계정이 없는 것과 같은 404). (RabbitMQ: admin.manager.find-login-id)
     *
     * @param dto 업체코드 · 휴대폰 번호
     * @param ip 클라이언트 IP
     * @returns 인증 ID · 만료 시각 (확인은 인증 ID + 인증번호)
     */
    @Transactional()
    async sendFindLoginId(dto: ManagerFindLoginIdDto, ip: string): Promise<ManagerFindLoginIdResultDto> {
        // 1. 업체코드 → 그 업체에서 그 번호가 등록된 매니저 (탈퇴 완료 제외)
        const store = await this.managerRepository.findManagerStore({store_code: dto.store_code});
        const manager = store ? await this.managerRepository.findManager({phone: dto.phone, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id, state_id: In(ACCOUNT_RECOVERY_STATES)}) : null;
        if (!manager) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 2. 같은 번호 하루 발송 한도 (한국 날짜)
        const now = new Date();
        const sentToday = await this.managerRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(kstDayStart(now))});
        if (sentToday >= getSmsDailyLimit()) {
            throw new HttpException({message: SMS_DAILY_LIMIT_MESSAGE}, HttpStatus.TOO_MANY_REQUESTS);
        }

        // 3. 발송 기록 → SMS 발송(마지막)
        const code = generateVerificationCode();
        const verification = buildSmsVerification({sms_purpose_id: SMS_PURPOSE.FIND_LOGIN_ID, user_id: manager.user_id, phone: dto.phone, code, ip, now});
        await this.managerRepository.insertSmsVerification(verification);
        await this.smsSender.send({to: dto.phone, text: smsVerificationText(code)});
        return {sms_verification_id: verification.sms_verification_id, expires_at: verification.expires_at.toISOString()};
    }

    /**
     * 매니저 아이디 찾기 — 인증 ID + 인증번호 확인 → 아이디 · 등록일시. (RabbitMQ: admin.manager.find-login-id-confirm)
     * 불일치는 예외를 return 한다 — 소비한 시도 횟수를 커밋하고 CommandDispatcher 가 failed(400)로 회신한다.
     *
     * @param dto 인증 ID · 인증번호
     * @returns 아이디 · 등록일시 — 불일치면 BadRequestException(반환, 커밋 뒤 실패)
     */
    @Transactional()
    async confirmFindLoginId(dto: ManagerFindLoginIdConfirmDto): Promise<ManagerFindLoginIdConfirmResultDto | BadRequestException> {
        // 1. 인증 기록 — 아이디 찾기 용도만. 사용함 · 만료
        const now = new Date();
        const verification = await this.managerRepository.findSmsVerification({sms_verification_id: dto.sms_verification_id, sms_purpose_id: SMS_PURPOSE.FIND_LOGIN_ID});
        if (!verification) {
            throw new NotFoundException({message: SMS_VERIFICATION_NOT_FOUND_MESSAGE});
        }
        const state = checkSmsVerification(verification, now);
        if (state !== 'USABLE') {
            throw new BadRequestException({message: SMS_STATE_MESSAGE[state]});
        }

        // 2. 그 기록의 매니저 (매니저 그룹 · 탈퇴 완료 제외)
        const manager = await this.managerRepository.findManager({user_id: verification.user_id, login_scope: LOGIN_SCOPE.MANAGER, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!manager) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 3. 시도 1회 소비 → 인증번호 비교 (불일치는 return — 소비한 횟수를 커밋한다)
        const consumed = await this.managerRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            return new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // 4. 인증 완료 → 결과
        const verifiedEntity = new SmsVerificationEntity();
        verifiedEntity.verified_at = now;
        await this.managerRepository.updateSmsVerification({sms_verification_id: verification.sms_verification_id}, verifiedEntity);
        return {login_id: manager.login_id, created_at: manager.created_at.toISOString()};
    }

    /**
     * 매니저 비밀번호 초기화 — 인증번호 발송. 업체코드의 업체에서 아이디 + 휴대폰 번호가 같은 매니저일 때만 보낸다(업체코드가 없으면 계정이 없는 것과 같은 404). (RabbitMQ: admin.manager.password-reset)
     *
     * @param dto 업체코드 · 아이디 · 휴대폰 번호
     * @param ip 클라이언트 IP
     * @returns 인증 ID · 만료 시각 (확인은 인증 ID + 인증번호)
     */
    @Transactional()
    async sendPasswordReset(dto: ManagerPasswordResetDto, ip: string): Promise<ManagerPasswordResetResultDto> {
        // 1. 업체코드 → 그 업체에서 아이디 + 번호가 같은 매니저
        const store = await this.managerRepository.findManagerStore({store_code: dto.store_code});
        const manager = store
            ? await this.managerRepository.findManager({login_id: dto.login_id, phone: dto.phone, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id, state_id: In(ACCOUNT_RECOVERY_STATES)})
            : null;
        if (!manager) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 2. 같은 번호 하루 발송 한도 (한국 날짜)
        const now = new Date();
        const sentToday = await this.managerRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(kstDayStart(now))});
        if (sentToday >= getSmsDailyLimit()) {
            throw new HttpException({message: SMS_DAILY_LIMIT_MESSAGE}, HttpStatus.TOO_MANY_REQUESTS);
        }

        // 3. 발송 기록 → SMS 발송(마지막)
        const code = generateVerificationCode();
        const verification = buildSmsVerification({sms_purpose_id: SMS_PURPOSE.PASSWORD_RESET, user_id: manager.user_id, phone: dto.phone, code, ip, now});
        await this.managerRepository.insertSmsVerification(verification);
        await this.smsSender.send({to: dto.phone, text: smsVerificationText(code)});
        return {sms_verification_id: verification.sms_verification_id, expires_at: verification.expires_at.toISOString()};
    }

    /**
     * 매니저 비밀번호 초기화 — 인증 ID + 인증번호 확인 → 임시 비밀번호(영문 + 숫자 10자리)로 바꾸고 그 기록의 번호로 SMS 를 보낸다. (RabbitMQ: admin.manager.password-reset-confirm)
     * 다음 로그인 때 비밀번호 변경이 필요하다는 표시(is_password_change_required = 1)를 남긴다. SMS 발송은 마지막 단계.
     * 불일치는 예외를 return 한다(소비한 시도 횟수 커밋). SMS 실패(503)는 throw — 비밀번호 변경과 시도 소비가 함께 롤백되고 재시도된다.
     *
     * @param dto 인증 ID · 인증번호
     * @returns 없음 — 불일치면 BadRequestException(반환, 커밋 뒤 실패)
     */
    @Transactional()
    async confirmPasswordReset(dto: ManagerPasswordResetConfirmDto): Promise<void | BadRequestException> {
        // 1. 인증 기록 — 비밀번호 초기화 용도만. 사용함 · 만료
        const now = new Date();
        const verification = await this.managerRepository.findSmsVerification({sms_verification_id: dto.sms_verification_id, sms_purpose_id: SMS_PURPOSE.PASSWORD_RESET});
        if (!verification) {
            throw new NotFoundException({message: SMS_VERIFICATION_NOT_FOUND_MESSAGE});
        }
        const state = checkSmsVerification(verification, now);
        if (state !== 'USABLE') {
            throw new BadRequestException({message: SMS_STATE_MESSAGE[state]});
        }

        // 2. 그 기록의 매니저 (매니저 그룹 · 탈퇴 완료 제외)
        const manager = await this.managerRepository.findManager({user_id: verification.user_id, login_scope: LOGIN_SCOPE.MANAGER, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!manager) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }

        // 3. 시도 1회 소비 → 인증번호 비교 (불일치는 return — 소비한 횟수를 커밋한다)
        const consumed = await this.managerRepository.consumeSmsVerificationAttempt(verification.sms_verification_id, SMS_MAX_ATTEMPTS);
        if (!consumed) {
            throw new BadRequestException({message: SMS_ATTEMPTS_EXCEEDED_MESSAGE});
        }
        if (sha256Hex(dto.code) !== verification.code_hash) {
            return new BadRequestException({message: SMS_CODE_MISMATCH_MESSAGE, validation_errors: createValidationError('code', SMS_CODE_MISMATCH_MESSAGE)});
        }

        // 4. 인증 완료 → 임시 비밀번호로 교체 + 변경 필요 표시 → SMS 발송(마지막)
        const verifiedEntity = new SmsVerificationEntity();
        verifiedEntity.verified_at = now;
        await this.managerRepository.updateSmsVerification({sms_verification_id: verification.sms_verification_id}, verifiedEntity);

        const temporaryPassword = generateTemporaryPassword();
        const managerEntity = new UserEntity();
        managerEntity.login_pw = await getBcrypt(temporaryPassword);
        managerEntity.is_password_change_required = 1;
        await this.managerRepository.updateManager({user_id: manager.user_id}, managerEntity);
        await this.smsSender.send({to: verification.phone, text: temporaryPasswordText(temporaryPassword)});
    }

    /**
     * 업체 관리자 등록 (업체 총관리자) — 같은 업체 안에서 아이디 · 휴대폰 번호가 겹치면 400, 임시 비밀번호는 업체 관리자 휴대폰으로 SMS(마지막). (RabbitMQ: admin.manager.staff)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param dto 아이디 · 이름 · 휴대폰 번호 · 성별 · 생년월일
     * @returns 등록한 업체 관리자 회원 ID
     */
    @Transactional()
    async registerStaff(user_id: string, dto: ManagerStaffDto): Promise<ManagerStaffResultDto> {
        // 1. 업체 총관리자의 업체 (안내 SMS 에 상호명 · 업체코드)
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        const store = head?.store_id ? await this.managerRepository.findManagerStore({store_id: head.store_id}) : null;
        if (!store) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 같은 업체 안 아이디 · 휴대폰 번호 (삭제 계정은 마스킹돼 걸리지 않는다)
        if ((await this.managerRepository.countStaff({login_id: dto.login_id, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id})) > 0) {
            throw new BadRequestException({message: STAFF_LOGIN_ID_TAKEN_MESSAGE, validation_errors: createValidationError('login_id', STAFF_LOGIN_ID_TAKEN_MESSAGE)});
        }
        if ((await this.managerRepository.countStaff({phone: dto.phone, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id})) > 0) {
            throw new BadRequestException({message: STAFF_PHONE_TAKEN_MESSAGE, validation_errors: createValidationError('phone', STAFF_PHONE_TAKEN_MESSAGE)});
        }

        // 3. 업체 관리자 계정 — 임시 비밀번호 · 첫 로그인 때 변경
        const temporaryPassword = generateTemporaryPassword();
        const staff = new UserEntity();
        staff.user_id = generateId();
        staff.user_search_code = generateId();
        staff.auth_id = AUTH_ID.MANAGER;
        staff.login_scope = LOGIN_SCOPE.MANAGER;
        staff.state_id = 'ACTIVE';
        staff.sns_id = null;
        staff.sns_user_id = null;
        staff.store_id = store.store_id;
        staff.login_id = dto.login_id;
        staff.login_pw = await getBcrypt(temporaryPassword);
        staff.name = dto.name;
        staff.gender = dto.gender;
        staff.birth = dto.birth;
        staff.phone = dto.phone;
        staff.phone_verified_at = null;
        staff.nickname = dto.name;
        staff.device_os = null;
        staff.device_token = null;
        staff.is_password_change_required = 1;
        staff.block_comment = null;
        staff.leave_comment = null;
        staff.leave_reserved_at = null;
        staff.leave_previous_state_id = null;
        staff.leave_backup = null;
        await this.managerRepository.insertStaff(staff);

        // 4. 안내 SMS (마지막 — 실패 503 이면 등록이 롤백되고 재시도된다)
        await this.smsSender.send({to: dto.phone, text: staffRegisteredText(store.store_name, store.store_code, dto.login_id, temporaryPassword)});
        return {user_id: staff.user_id};
    }

    /**
     * 업체 관리자 목록 (업체 총관리자) — 내 업체의 매니저 그룹(업체 총관리자 포함) · 검색어. (내부 HTTP: GET /internal/v1/admin-service/manager/staff)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param dto 페이지 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getStaffList(user_id: string, dto: ManagerStaffListDto): Promise<ManagerStaffListResultDto> {
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const where = buildStaffListWhere(head.store_id, dto);
        const total_count = await this.managerRepository.countStaff(where);
        const pagination = new Pagination({...dto, total_count});
        const staff = await this.managerRepository.findStaffList(where, pagination.limit, pagination.offset);
        return {list: staff.map(toStaffListItem), pagination: pagination.getPagination()};
    }

    /**
     * 업체 관리자 상세 (업체 총관리자) — 내 업체의 업체 관리자만. (내부 HTTP: GET /internal/v1/admin-service/manager/staff/:user_id)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     * @returns 상세
     */
    async getStaff(user_id: string, staff_user_id: string): Promise<ManagerStaffDetailResultDto> {
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({
            user_id: staff_user_id,
            login_scope: LOGIN_SCOPE.MANAGER,
            auth_id: AUTH_ID.MANAGER,
            store_id: head.store_id,
            state_id: In(STAFF_STATES),
        });
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }
        return toStaffDetail(staff);
    }

    /**
     * 업체 관리자 수정 (업체 총관리자) — 이름(닉네임 같이) · 휴대폰 번호 · 성별 · 생년월일. 같은 업체의 다른 계정과 번호가 겹치면 400. (RabbitMQ: admin.manager.staff-update)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     * @param dto 바꿀 정보
     */
    @Transactional()
    async updateStaff(user_id: string, staff_user_id: string, dto: ManagerStaffUpdateDto): Promise<void> {
        // 1. 내 업체의 업체 관리자
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({
            user_id: staff_user_id,
            login_scope: LOGIN_SCOPE.MANAGER,
            auth_id: AUTH_ID.MANAGER,
            store_id: head.store_id,
            state_id: In(STAFF_STATES),
        });
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }

        // 2. 같은 업체의 다른 계정과 번호
        if ((await this.managerRepository.countStaff({phone: dto.phone, login_scope: LOGIN_SCOPE.MANAGER, store_id: head.store_id, user_id: Not(staff.user_id)})) > 0) {
            throw new BadRequestException({message: STAFF_PHONE_TAKEN_MESSAGE, validation_errors: createValidationError('phone', STAFF_PHONE_TAKEN_MESSAGE)});
        }

        // 3. 수정
        const staffEntity = new UserEntity();
        staffEntity.name = dto.name;
        staffEntity.nickname = dto.name;
        staffEntity.phone = dto.phone;
        staffEntity.gender = dto.gender;
        staffEntity.birth = dto.birth;
        await this.managerRepository.updateStaff({user_id: staff.user_id}, staffEntity);
    }

    /**
     * 업체 관리자 비밀번호 초기화 (업체 총관리자) — 임시 비밀번호(영문 + 숫자 10자리) + 변경 필요 표시, 그 휴대폰으로 SMS(마지막). (RabbitMQ: admin.manager.staff-password-reset)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     */
    @Transactional()
    async resetStaffPassword(user_id: string, staff_user_id: string): Promise<void> {
        // 1. 내 업체의 업체 관리자
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({
            user_id: staff_user_id,
            login_scope: LOGIN_SCOPE.MANAGER,
            auth_id: AUTH_ID.MANAGER,
            store_id: head.store_id,
            state_id: In(STAFF_STATES),
        });
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }
        if (!staff.phone) {
            throw new BadRequestException({message: '휴대폰 번호가 등록되지 않은 계정입니다.'});
        }

        // 2. 임시 비밀번호 → SMS (마지막)
        const temporaryPassword = generateTemporaryPassword();
        const staffEntity = new UserEntity();
        staffEntity.login_pw = await getBcrypt(temporaryPassword);
        staffEntity.is_password_change_required = 1;
        await this.managerRepository.updateManager({user_id: staff.user_id}, staffEntity);
        await this.smsSender.send({to: staff.phone, text: temporaryPasswordText(temporaryPassword)});
    }

    /**
     * 업체 관리자 정지 · 해제 (업체 총관리자) — ACTIVE ↔ BLOCK, 같은 상태면 400. 정지는 로그인 불가 상태라 다음 요청부터 401 · 재발급도 막힌다. 정지 사유는 정지할 때만 남기고 해제하면 지운다. (RabbitMQ: admin.manager.staff-state)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     * @param dto 바꿀 상태 · 정지 사유
     */
    @Transactional()
    async changeStaffState(user_id: string, staff_user_id: string, dto: ManagerStaffStateDto): Promise<void> {
        // 1. 내 업체의 업체 관리자
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({
            user_id: staff_user_id,
            login_scope: LOGIN_SCOPE.MANAGER,
            auth_id: AUTH_ID.MANAGER,
            store_id: head.store_id,
            state_id: In(STAFF_STATES),
        });
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }
        if (staff.state_id === dto.state_id) {
            throw new BadRequestException({message: '이미 같은 상태입니다.'});
        }

        // 2. 상태 · 정지 사유
        const staffEntity = new UserEntity();
        staffEntity.state_id = dto.state_id;
        staffEntity.block_comment = dto.state_id === 'BLOCK' ? (dto.block_comment ?? null) : null;
        await this.managerRepository.updateManager({user_id: staff.user_id}, staffEntity);
    }

    /**
     * 업체 관리자 삭제 (업체 총관리자) — 탈퇴(LEAVE) + 원본 백업, 아이디 DEL_<user_id> · 휴대폰 번호 NULL 로 마스킹해 같은 아이디 · 번호로 다시 등록할 수 있게 한다. (RabbitMQ: admin.manager.staff-delete)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     */
    @Transactional()
    async deleteStaff(user_id: string, staff_user_id: string): Promise<void> {
        // 1. 내 업체의 업체 관리자
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({
            user_id: staff_user_id,
            login_scope: LOGIN_SCOPE.MANAGER,
            auth_id: AUTH_ID.MANAGER,
            store_id: head.store_id,
            state_id: In(STAFF_STATES),
        });
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }

        // 2. 탈퇴 + 백업 + 아이디 · 번호 마스킹
        const staffEntity = new UserEntity();
        staffEntity.state_id = 'LEAVE';
        staffEntity.leave_backup = JSON.stringify(staff); // 마스킹 전 원본(반드시 마스킹 할당보다 먼저)
        staffEntity.login_id = `DEL_${staff.user_id}`;
        staffEntity.phone = null;
        staffEntity.device_os = null;
        staffEntity.device_token = null;
        await this.managerRepository.updateStaff({user_id: staff.user_id}, staffEntity);
    }
}
