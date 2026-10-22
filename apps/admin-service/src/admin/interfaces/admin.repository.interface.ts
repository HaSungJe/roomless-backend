import type {FindOptionsWhere} from 'typeorm';
import type {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import type {SessionEntity} from '@app/database/entities/user/session.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 로그인 관리자 조회 결과 — 회원 컬럼 + 상태의 로그인 가능 여부 (QueryBuilder raw) */
export interface LoginAdminRow {
    user_id: string;
    login_id: string;
    name: string;
    auth_id: string;
    state_id: string;
    is_login_allowed: number;
}

/**
 * 관리자 repository 포트 — 공유 DB 의 t_user(관리자 그룹) · 세션을 관리자 도메인 어휘로 다룬다.
 * WHERE 는 service 가 만들고 repository 는 실행 + DB 오류 변환만 한다.
 * insert · update 의 엔티티는 호출자가 `new XEntity()` + 필드 할당으로 만든다(@BeforeInsert/@BeforeUpdate 트리거).
 */
export interface AdminRepositoryInterface {
    /** 관리자 단건 조회 (t_user) */
    findAdmin(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    /** 로그인 관리자 조회 — 관리자 그룹 · 로그인 가능 상태만 */
    findLoginAdmin(user_id: string): Promise<LoginAdminRow | null>;
    /** 관리자 정보 수정 (t_user) */
    updateAdmin(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
    insertSession(entity: SessionEntity): Promise<void>;
    findSession(where: FindOptionsWhere<SessionEntity>): Promise<SessionEntity | null>;
    insertSessionRefresh(entity: SessionRefreshEntity): Promise<void>;
    findSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>): Promise<SessionRefreshEntity | null>;
    updateSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>, entity: SessionRefreshEntity): Promise<void>;
}
