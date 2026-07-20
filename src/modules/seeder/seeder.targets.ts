import { EntityTarget, ObjectLiteral } from 'typeorm';
import { AuthEntity } from '@root/api/v1/user/entities/auth.entity';
import { StateEntity } from '@root/api/v1/user/entities/state.entity';
import { SnsEntity } from '@root/api/v1/user/entities/sns.entity';

/** 시드 대상 1건 — 엔티티 클래스 + 그 엔티티의 기본 데이터 */
export interface SeedTarget<T extends ObjectLiteral = ObjectLiteral> {
    entity: EntityTarget<T>;
    data: T[];
}

/** 권한(t_auth) 기본 데이터 */
export const AUTH_SEED_DATA: AuthEntity[] = [
    {auth_id: 'SUPER_ADMIN', auth_name: '총괄관리자', level: 999},
    {auth_id: 'ADMIN', auth_name: '관리자', level: 998},
    {auth_id: 'MANAGER', auth_name: '매니저', level: 101},
    {auth_id: 'USER', auth_name: '이용자', level: 1},
];

/** 상태(t_state) 기본 데이터 */
export const STATE_SEED_DATA: StateEntity[] = [
    {state_id: 'ACTIVE', state_name: '정상', is_login_able: 1},
    {state_id: 'BLOCK', state_name: '정지', is_login_able: 0},
    {state_id: 'LEAVE_WAIT', state_name: '탈퇴 대기', is_login_able: 1},
    {state_id: 'LEAVE', state_name: '탈퇴', is_login_able: 0},
];

/** SNS(t_sns) 기본 데이터 */
export const SNS_SEED_DATA: SnsEntity[] = [
    {sns_id: 'NAVER', sns_name: '네이버'},
    {sns_id: 'KAKAO', sns_name: '카카오'},
    {sns_id: 'GOOGLE', sns_name: '구글'},
    {sns_id: 'EMAIL', sns_name: '이메일'},
];

/**
 * 프로젝트 시작 시 기본 데이터를 보장할 엔티티 목록 (기본 데이터 단일 관리 지점).
 * 새 기본 데이터를 추가하려면 위에 `<X>_SEED_DATA` 배열을 정의하고 아래 목록에 한 줄 추가한다.
 * FK 의존이 있으면 부모 엔티티를 먼저 배치한다.
 */
export const SEED_TARGETS: SeedTarget[] = [
    {entity: AuthEntity, data: AUTH_SEED_DATA},
    {entity: StateEntity, data: STATE_SEED_DATA},
    {entity: SnsEntity, data: SNS_SEED_DATA},
];
