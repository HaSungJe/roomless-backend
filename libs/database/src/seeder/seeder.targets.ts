import type {EntityTarget, ObjectLiteral} from 'typeorm';
import {AuthEntity} from '../entities/user/auth.entity.js';
import {SnsEntity} from '../entities/user/sns.entity.js';
import {StateEntity} from '../entities/user/state.entity.js';

/** 시드 대상 1건 — 엔티티 클래스 + 그 엔티티의 기본 데이터 */
export interface SeedTarget<T extends ObjectLiteral = ObjectLiteral> {
    entity: EntityTarget<T>;
    data: T[];
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
    {state_id: 'ACTIVE', state_name: '정상', is_login_able: 1},
    {state_id: 'BLOCK', state_name: '정지', is_login_able: 0},
    {state_id: 'LEAVE_WAIT', state_name: '탈퇴 대기', is_login_able: 1},
    {state_id: 'LEAVE', state_name: '탈퇴', is_login_able: 0},
];

/** SNS(t_sns) 기본 데이터 — 가입 DTO 의 sns_id 허용값(GOOGLE · FACEBOOK · APPLE · KAKAO · LINE)을 모두 포함한다 */
export const SNS_SEED_DATA: SnsEntity[] = [
    {sns_id: 'GOOGLE', sns_name: '구글'},
    {sns_id: 'FACEBOOK', sns_name: '페이스북'},
    {sns_id: 'APPLE', sns_name: '애플'},
    {sns_id: 'KAKAO', sns_name: '카카오'},
    {sns_id: 'LINE', sns_name: '라인'},
    {sns_id: 'NAVER', sns_name: '네이버'},
];

/**
 * 애플리케이션 시작 시 기본 데이터를 보장할 엔티티 목록 (기본 데이터 단일 관리 지점).
 * 새 기본 데이터는 위에 `<X>_SEED_DATA` 를 정의하고 여기에 한 줄 추가한다. FK 부모를 먼저 둔다.
 */
export const SEED_TARGETS: SeedTarget[] = [
    {entity: AuthEntity, data: AUTH_SEED_DATA},
    {entity: StateEntity, data: STATE_SEED_DATA},
    {entity: SnsEntity, data: SNS_SEED_DATA},
];
