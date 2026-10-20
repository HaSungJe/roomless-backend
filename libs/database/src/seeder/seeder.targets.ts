import {randomUUID} from 'node:crypto';
import type {DataSource, EntityTarget, ObjectLiteral} from 'typeorm';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {AuthEntity} from '../entities/user/auth.entity.js';
import {SmsPurposeEntity} from '../entities/user/sms-purpose.entity.js';
import {SnsEntity} from '../entities/user/sns.entity.js';
import {StateEntity} from '../entities/user/state.entity.js';
import {UserSettingEntity} from '../entities/user/user-setting.entity.js';
import {UserEntity} from '../entities/user/user.entity.js';

/** 시드 대상 1건 — 엔티티 클래스 + 그 엔티티의 기본 데이터 */
export interface SeedTarget<T extends ObjectLiteral = ObjectLiteral> {
    entity: EntityTarget<T>;
    /** 기본 데이터 — 시드 시점에 계산해야 하면(비밀번호 해시 · 다른 행 참조) 만드는 함수 */
    data: T[] | ((dataSource: DataSource) => Promise<T[]>);
    /** 이미 있는지 확인할 유일 컬럼 — 없으면 PK. PK 를 생성하는 행(총관리자)은 유일 컬럼으로 확인한다 */
    key?: string;
}

/** 권한(t_auth) 기본 데이터 */
export const AUTH_SEED_DATA: AuthEntity[] = [
    {auth_id: 'SUPER_ADMIN', auth_name: '총괄관리자', level: 999},
    {auth_id: 'ADMIN', auth_name: '관리자', level: 998},
    {auth_id: 'HEAD_MANAGER', auth_name: '총괄매니저', level: 102},
    {auth_id: 'MANAGER', auth_name: '매니저', level: 101},
    {auth_id: 'USER', auth_name: '이용자', level: 1},
];

/** 상태(t_state) 기본 데이터 */
export const STATE_SEED_DATA: StateEntity[] = [
    {state_id: 'ACTIVE', state_name: '정상', is_login_allowed: 1},
    {state_id: 'BLOCK', state_name: '정지', is_login_allowed: 0},
    {state_id: 'LEAVE_WAIT', state_name: '탈퇴 대기', is_login_allowed: 1},
    {state_id: 'LEAVE', state_name: '탈퇴', is_login_allowed: 0},
];

/** SNS(t_sns) 기본 데이터 — 가입 · 로그인 DTO 의 sns_id 허용값(NAVER · KAKAO)을 모두 포함한다. 나머지는 기존 FK 대상이라 남긴다 */
export const SNS_SEED_DATA: SnsEntity[] = [
    {sns_id: 'GOOGLE', sns_name: '구글'},
    {sns_id: 'FACEBOOK', sns_name: '페이스북'},
    {sns_id: 'APPLE', sns_name: '애플'},
    {sns_id: 'KAKAO', sns_name: '카카오'},
    {sns_id: 'LINE', sns_name: '라인'},
    {sns_id: 'NAVER', sns_name: '네이버'},
];

/** SMS 인증 용도(t_sms_purpose) 기본 데이터 — user.constants.ts 의 SMS_PURPOSE 와 같다 */
export const SMS_PURPOSE_SEED_DATA: SmsPurposeEntity[] = [
    {sms_purpose_id: 'PHONE_VERIFY', sms_purpose_name: '휴대폰 인증'},
    {sms_purpose_id: 'FIND_LOGIN_ID', sms_purpose_name: '아이디 찾기'},
    {sms_purpose_id: 'PASSWORD_RESET', sms_purpose_name: '비밀번호 초기화'},
];

/**
 * 첫 총관리자 `admin` / `1234` — 비밀번호는 시드 시점에 bcrypt + pepper 로 해시하고, 첫 로그인 때 변경 필요로 둔다.
 * login_id 로 이미 있는지 확인하므로(SEED_TARGETS 의 key), 비밀번호를 바꾼 뒤에는 덮지 않는다.
 *
 * @returns 총관리자 1행
 */
export async function buildSuperAdminSeed(): Promise<UserEntity[]> {
    const admin = new UserEntity();
    admin.user_id = randomUUID().replace(/-/g, '');
    admin.user_search_code = randomUUID().replace(/-/g, '');
    admin.auth_id = 'SUPER_ADMIN';
    admin.state_id = 'ACTIVE';
    admin.sns_id = null;
    admin.sns_user_id = null;
    admin.store_id = null;
    admin.login_id = 'admin';
    admin.login_pw = await getBcrypt('1234');
    admin.name = '총관리자';
    admin.gender = 'M';
    admin.birth = '1970-01-01';
    admin.phone = null;
    admin.phone_verified_at = null;
    admin.nickname = '총관리자';
    admin.device_os = null;
    admin.device_token = null;
    admin.is_password_change_required = 1;
    admin.block_comment = null;
    admin.leave_comment = null;
    admin.leave_reserved_at = null;
    admin.leave_previous_state_id = null;
    admin.leave_backup = null;
    return [admin];
}

/**
 * 첫 총관리자의 회원 설정 — 로그인 회원 조회가 회원 설정을 inner join 한다(findLoginUser).
 * login_id 가 admin 인 회원을 찾아 그 user_id 로 만든다. 총관리자가 없으면 만들지 않는다.
 *
 * @param dataSource 기본 DataSource
 * @returns 회원 설정 0 ~ 1행
 */
export async function buildSuperAdminSettingSeed(dataSource: DataSource): Promise<UserSettingEntity[]> {
    const admin = await dataSource.getRepository(UserEntity).findOne({where: {login_id: 'admin'}});
    if (!admin) {
        return [];
    }
    const setting = new UserSettingEntity();
    setting.user_setting_id = randomUUID().replace(/-/g, '');
    setting.user_id = admin.user_id;
    setting.bio = null;
    return [setting];
}

/**
 * 애플리케이션 시작 시 기본 데이터를 보장할 엔티티 목록 (기본 데이터 단일 관리 지점).
 * 새 기본 데이터는 위에 `<X>_SEED_DATA`(또는 만드는 함수)를 정의하고 여기에 한 줄 추가한다. FK 부모를 먼저 둔다.
 */
export const SEED_TARGETS: SeedTarget[] = [
    {entity: AuthEntity, data: AUTH_SEED_DATA},
    {entity: StateEntity, data: STATE_SEED_DATA},
    {entity: SnsEntity, data: SNS_SEED_DATA},
    {entity: SmsPurposeEntity, data: SMS_PURPOSE_SEED_DATA},
    {entity: UserEntity, data: buildSuperAdminSeed, key: 'login_id'},
    {entity: UserSettingEntity, data: buildSuperAdminSettingSeed, key: 'user_id'},
];
