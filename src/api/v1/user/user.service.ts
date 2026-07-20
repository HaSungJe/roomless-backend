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
import { USER_REPOSITORY } from './user.symbols';
import type { UserRepositoryInterface } from './interfaces/user.repository.interface';
import { isAdult, generateSnsLoginId, issueAccessAndRefresh } from './user.util';
import { translate } from '@root/common/i18n/translate';
import { createValidationError } from '@root/common/utils/validation';
import { getBcrypt } from '@root/common/utils/bcrypt';
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
            // 입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.
            const message = translate('user.service.sign.age_restriction');
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
            // 잘못된 로그인 정보입니다.
            throw new NotFoundException({message: translate('user.service.login.invalid_login')});
        }

        // 2. BLOCK 차단
        if (user.state_id === 'BLOCK') {
            throw new HttpException(
                // 이용이 제한된 계정입니다.
                {message: translate('user.service.login.account_blocked'), block_comment: user.block_comment},
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
     * 로그인 토큰 재발급
     * - jwtService.verify 로 서명+만료+payload type 검증 (실패 → 401)
     * - sha256 hash 로 t_session_refresh 조회 (미존재 or end_at < now → 401)
     * - 회원 state 재검증 (ACTIVE 외 모두 401, 안전망으로 end_at 단축)
     * - old refresh end_at = now + 1m 단축 (grace)
     * - 새 access/refresh 발급, before_refresh_hash = old hash 로 t_session_refresh insert
     */
    @Transactional()
    async tokenRefresh(dto: UserTokenRefreshDto): Promise<UserTokenRefreshResultDto> {
        // 1. JWT 검증
        let payload: {type: string; user_id: string; session_id: string};
        try {
            payload = this.jwtService.verify(dto.refresh_token);
        } catch {
            // 유효하지 않은 토큰입니다.
            throw new UnauthorizedException({message: translate('user.service.token_refresh.invalid_refresh_token')});
        }
        if (payload.type !== 'refresh') {
            // 유효하지 않은 토큰입니다.
            throw new UnauthorizedException({message: translate('user.service.token_refresh.invalid_refresh_token')});
        }

        // 2. DB 조회 (refresh_hash)
        const refresh_hash = sha256Hex(dto.refresh_token);
        const oldRefresh = await this.userRepository.findSessionRefresh({refresh_hash});
        if (!oldRefresh) {
            // 유효하지 않은 토큰입니다.
            throw new UnauthorizedException({message: translate('user.service.token_refresh.invalid_refresh_token')});
        }
        // DB end_at 만료 확인 (chain 재사용 차단)
        if (oldRefresh.end_at.getTime() < Date.now()) {
            // 유효하지 않은 토큰입니다.
            throw new UnauthorizedException({message: translate('user.service.token_refresh.invalid_refresh_token')});
        }

        // 3. 회원 state 재검증
        const user = await this.userRepository.findUser({user_id: payload.user_id});
        if (!user || user.state_id !== 'ACTIVE') {
            // 안전망: end_at 단축
            const expireEntity = new SessionRefreshEntity();
            expireEntity.end_at = dayjs().add(1, 'minute').toDate();
            await this.userRepository.updateSessionRefresh({refresh_hash}, expireEntity);
            // 유효하지 않은 토큰입니다.
            throw new UnauthorizedException({message: translate('user.service.token_refresh.unauthorized_user')});
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
            // 일치하는 회원이 없습니다.
            throw new NotFoundException({message: translate('user.service.leave.member_not_found')});
        }
        if (user.state_id !== 'ACTIVE' && user.state_id !== 'BLOCK') {
            // 탈퇴를 신청할 수 없는 상태입니다.
            throw new BadRequestException({message: translate('user.service.leave.invalid_state')});
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
            // 일치하는 회원이 없습니다.
            throw new NotFoundException({message: translate('user.service.cancel_leave.member_not_found')});
        }
        if (user.state_id !== 'LEAVE_WAIT') {
            // 탈퇴 철회를 할 수 없는 상태입니다.
            throw new BadRequestException({message: translate('user.service.cancel_leave.invalid_state')});
        }

        const entity = new UserEntity();
        entity.state_id = user.leave_prev_state_id ?? 'ACTIVE';
        entity.leave_reserved_at = null;
        entity.leave_prev_state_id = null;
        entity.leave_comment = null;
        await this.userRepository.updateUser({user_id}, entity);
    }
}
