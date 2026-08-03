import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import dayjs from 'dayjs';
import { In } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { v4 } from 'uuid';
import { UserEntity } from './entities/user.entity';
import { UserSettingEntity } from './entities/user-setting.entity';
import { SessionEntity } from './entities/session.entity';
import { SessionRefreshEntity } from './entities/session-refresh.entity';
import { UserSignDto, UserSignResultDto } from './dto/user-sign.dto';
import { UserLoginDto, UserLoginResultDto } from './dto/user-login.dto';
import { UserTokenRefreshDto, UserTokenRefreshResultDto } from './dto/user-token-refresh.dto';
import { UserLeaveDto } from './dto/user-leave.dto';
import { UserGeneralSignDto, UserGeneralSignResultDto } from './dto/user-general-sign.dto';
import { UserGeneralLoginDto, UserGeneralLoginResultDto } from './dto/user-general-login.dto';
import { UserPasswordDto } from './dto/user-password.dto';
import { USER_REPOSITORY } from './user.symbols';
import type { UserRepositoryInterface } from './interfaces/user.repository.interface';
import { isAdult, generateSnsLoginId, issueAccessAndRefresh } from './user.util';
import { createValidationError } from '@root/common/utils/validation';
import { getBcrypt, matchBcrypt } from '@root/common/utils/bcrypt';
import { sha256Hex } from '@root/common/utils/hash';
import { encryptAesGcm } from '@root/common/utils/cipher';

@Injectable()
export class UserService {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: UserRepositoryInterface,
        private readonly jwtService: JwtService,
    ) {}

    /**
     * SNS 회원가입 — SNS 식별정보로 회원/설정/세션 생성 후 토큰 4종 반환.
     */
    @Transactional()
    async sign(dto: UserSignDto, ip: string): Promise<UserSignResultDto> {
        // 1. 만 18세 이하 가입 제한
        if (!isAdult(dto.birth)) {
            const message = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';
            throw new BadRequestException({
                message,
                validationErrors: createValidationError('birth', message),
            });
        }

        // 2. ID 생성
        const user_id = v4().replace(/-/g, '');
        const user_setting_id = v4().replace(/-/g, '');
        const session_id = v4().replace(/-/g, '');
        const login_id = generateSnsLoginId(dto.sns_id);
        const login_pw = await getBcrypt(login_id);
        const user_search_code = v4().replace(/-/g, '');

        // 3. t_user 생성
        const userEntity = new UserEntity();
        userEntity.user_id = user_id;
        userEntity.user_search_code = user_search_code;
        userEntity.auth_id = 'USER';
        userEntity.state_id = 'ACTIVE';
        userEntity.sns_id = dto.sns_id;
        userEntity.sns_user_id = dto.sns_user_id;
        userEntity.login_id = login_id;
        userEntity.login_pw = login_pw;
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
        userSettingEntity.user_setting_id = user_setting_id;
        userSettingEntity.user_id = user_id;
        userSettingEntity.bio = null;
        await this.userRepository.insertUserSetting(userSettingEntity);

        // 5. t_session 생성
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user_id;
        sessionEntity.ip = ip ?? null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 6. 토큰 발급 (공통 util)
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
     * 일반 회원가입 — 아이디/비밀번호로 회원/설정/세션 생성 후 토큰 4종 반환. sns_id/sns_user_id 는 null.
     */
    @Transactional()
    async generalSign(dto: UserGeneralSignDto, ip: string): Promise<UserGeneralSignResultDto> {
        // 1. 만 18세 이하 가입 제한
        if (!isAdult(dto.birth)) {
            const message = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';
            throw new BadRequestException({
                message,
                validationErrors: createValidationError('birth', message),
            });
        }

        // 2. ID 생성
        const user_id = v4().replace(/-/g, '');
        const user_setting_id = v4().replace(/-/g, '');
        const session_id = v4().replace(/-/g, '');
        const login_pw = await getBcrypt(dto.login_pw);
        const user_search_code = v4().replace(/-/g, '');

        // 3. t_user 생성 — 일반 회원: sns 미보유
        const userEntity = new UserEntity();
        userEntity.user_id = user_id;
        userEntity.user_search_code = user_search_code;
        userEntity.auth_id = 'USER';
        userEntity.state_id = 'ACTIVE';
        userEntity.sns_id = null;
        userEntity.sns_user_id = null;
        userEntity.login_id = dto.login_id;
        userEntity.login_pw = login_pw;
        userEntity.name = dto.nickname;
        userEntity.gender = dto.gender;
        userEntity.birth = dto.birth;
        userEntity.phone = null;
        userEntity.nickname = dto.nickname;
        userEntity.device_os = dto.device_os ?? null;
        userEntity.device_token = dto.device_token ?? null;
        userEntity.is_password_change_required = 0;
        await this.userRepository.insertUser(userEntity);   // 아이디 중복은 UK_User_LoginId 분기 400

        // 4. t_user_setting 생성
        const userSettingEntity = new UserSettingEntity();
        userSettingEntity.user_setting_id = user_setting_id;
        userSettingEntity.user_id = user_id;
        userSettingEntity.bio = null;
        await this.userRepository.insertUserSetting(userSettingEntity);

        // 5. t_session 생성
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user_id;
        sessionEntity.ip = ip ?? null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 6. 토큰 발급 (공통 util)
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
     * SNS 로그인
     * - (sns_id, sns_user_id) + state_id IN (ACTIVE, BLOCK) 로 조회
     * - 미존재 / LEAVE_WAIT / LEAVE → 404 "잘못된 로그인 정보입니다."
     * - BLOCK → 403 "이용이 제한된 계정입니다." + body.block_comment
     * - ACTIVE → (device 동봉 시 t_user.device_* 갱신) + t_session + t_session_refresh insert, 토큰 4종 반환
     * - device_os/device_token 둘 다 입력된 경우에만 t_user 동기화(마지막 로그인 기기 유지), 미입력이면 기존값 보존
     */
    @Transactional()
    async login(dto: UserLoginDto, ip: string): Promise<UserLoginResultDto> {
        // 1. 회원 조회 (ACTIVE / BLOCK 만)
        const user = await this.userRepository.findUser({
            sns_id: dto.sns_id,
            sns_user_id: dto.sns_user_id,
            state_id: In(['ACTIVE', 'BLOCK']),
        });
        if (!user) {
            throw new NotFoundException({message: '잘못된 로그인 정보입니다.'});
        }

        // 2. BLOCK 차단
        if (user.state_id === 'BLOCK') {
            throw new HttpException(
                {message: '이용이 제한된 계정입니다.', block_comment: user.block_comment},
                HttpStatus.FORBIDDEN,
            );
        }

        // 2-5. device 정보 입력 시 t_user 동기화 (마지막 로그인 기기 유지)
        //      device_os/device_token 둘 다 입력된 경우에만 update — 미입력이면 기존값 보존(null 초기화 ❌)
        if (dto.device_os && dto.device_token) {
            const userDeviceEntity = new UserEntity();   // 객체리터럴 ❌ — new+할당(@BeforeUpdate update_at 트리거)
            userDeviceEntity.device_os = dto.device_os;
            userDeviceEntity.device_token = dto.device_token;
            await this.userRepository.updateUser({user_id: user.user_id}, userDeviceEntity);
        }

        // 3. session 생성
        const session_id = v4().replace(/-/g, '');
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user.user_id;
        sessionEntity.ip = ip ?? null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 4. 토큰 발급 (공통 util)
        const tokens = issueAccessAndRefresh(this.jwtService, {user_id: user.user_id, session_id});

        // 5. refresh 저장
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
     * 일반 로그인
     * - login_id + state_id IN (ACTIVE, BLOCK) 조회 → 미존재 404 "잘못된 로그인 정보입니다."
     * - matchBcrypt 불일치 → 동일 404 (아이디/비밀번호 구분 비노출)
     * - BLOCK → 403 + block_comment (비밀번호 검증 후 판정 — 비밀번호 없이 정지 여부 탐지 방지)
     * - ACTIVE → device 동기화(둘 다 입력 시) + 세션/refresh 발급 (SNS login 과 동일)
     */
    @Transactional()
    async generalLogin(dto: UserGeneralLoginDto, ip: string): Promise<UserGeneralLoginResultDto> {
        // 1. 회원 조회 (ACTIVE / BLOCK 만)
        const user = await this.userRepository.findUser({
            login_id: dto.login_id,
            state_id: In(['ACTIVE', 'BLOCK']),
        });
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
            throw new HttpException(
                {message: '이용이 제한된 계정입니다.', block_comment: user.block_comment},
                HttpStatus.FORBIDDEN,
            );
        }

        // 3-5. device 정보 입력 시 t_user 동기화 (마지막 로그인 기기 유지)
        //      device_os/device_token 둘 다 입력된 경우에만 update — 미입력이면 기존값 보존(null 초기화 ❌)
        if (dto.device_os && dto.device_token) {
            const userDeviceEntity = new UserEntity();   // 객체리터럴 ❌ — new+할당(@BeforeUpdate update_at 트리거)
            userDeviceEntity.device_os = dto.device_os;
            userDeviceEntity.device_token = dto.device_token;
            await this.userRepository.updateUser({user_id: user.user_id}, userDeviceEntity);
        }

        // 4. session 생성
        const session_id = v4().replace(/-/g, '');
        const sessionEntity = new SessionEntity();
        sessionEntity.session_id = session_id;
        sessionEntity.user_id = user.user_id;
        sessionEntity.ip = ip ?? null;
        sessionEntity.device_os = dto.device_os ?? null;
        sessionEntity.device_token = dto.device_token ?? null;
        sessionEntity.is_delete = 0;
        await this.userRepository.insertSession(sessionEntity);

        // 5. 토큰 발급 (공통 util)
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
            is_password_change_required: user.is_password_change_required,
        };
    }

    /**
     * 로그인 토큰 재발급
     * - jwtService.verify 로 서명+만료+payload type 검증 (실패 → 401)
     * - sha256 hash 로 t_session_refresh 조회 (미존재 or end_at < now → 401)
     * - 세션 조회 + ip 체크 (세션 미존재 or 로그인 시점 저장 ip 와 요청 ip 불일치 → 401 거부, end_at 단축 없음)
     *   저장 ip 또는 요청 ip 가 없으면 비교 생략(하위호환)
     * - 회원 state 재검증 (ACTIVE 외 모두 401, 안전망으로 end_at 단축)
     * - old refresh end_at = now + 1m 단축 (grace)
     * - 새 access/refresh 발급, before_refresh_hash = old hash 로 t_session_refresh insert
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

        // 2. DB 조회 (refresh_hash)
        const refresh_hash = sha256Hex(dto.refresh_token);
        const oldRefresh = await this.userRepository.findSessionRefresh({refresh_hash});
        if (!oldRefresh) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }
        // DB end_at 만료 확인 (chain 재사용 차단)
        if (oldRefresh.end_at.getTime() < Date.now()) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }

        // 2-5. 세션 ip 체크 — 로그인 시점 저장 ip 와 불일치 시 거부(만료 단축 없음)
        const session = await this.userRepository.findSession({session_id: payload.session_id});
        if (!session) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }
        if (session.ip && ip && session.ip !== ip) {
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }

        // 3. 회원 state 재검증
        const user = await this.userRepository.findUser({user_id: payload.user_id});
        if (!user || user.state_id !== 'ACTIVE') {
            // 안전망: end_at 단축
            const expireEntity = new SessionRefreshEntity();
            expireEntity.end_at = dayjs().add(1, 'minute').toDate();
            await this.userRepository.updateSessionRefresh({refresh_hash}, expireEntity);
            throw new UnauthorizedException({message: '유효하지 않은 토큰입니다.'});
        }

        // 4. old refresh 단축 (1분 후 만료)
        const shrinkEntity = new SessionRefreshEntity();
        shrinkEntity.end_at = dayjs().add(1, 'minute').toDate();
        await this.userRepository.updateSessionRefresh({refresh_hash}, shrinkEntity);

        // 5. 새 토큰 발급 (util)
        const tokens = issueAccessAndRefresh(this.jwtService, {
            user_id: payload.user_id,
            session_id: payload.session_id,
        });

        // 6. 새 refresh insert (chain)
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
     * 회원 탈퇴 신청 — ACTIVE/BLOCK 회원을 LEAVE_WAIT 로 전환하고 14일 뒤 예약시각 지정.
     * - 미존재 → 404, 이미 LEAVE_WAIT/LEAVE → 400. 직전 상태는 leave_prev_state_id 로 스냅샷(철회 복원용).
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
     * 회원 탈퇴 철회 — LEAVE_WAIT 회원을 직전 상태(leave_prev_state_id, 없으면 ACTIVE)로 복원하고 예약/스냅샷 초기화.
     * - 미존재 → 404, LEAVE_WAIT 아님 → 400.
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
     * 비밀번호 변경 — 로그인 회원 공용. 성공 시 변경 필요 플래그를 함께 내린다.
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
}
