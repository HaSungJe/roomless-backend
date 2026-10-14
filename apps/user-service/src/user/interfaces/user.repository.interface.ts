import type {FindOptionsWhere} from 'typeorm';
import type {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import type {SessionEntity} from '@app/database/entities/user/session.entity.js';
import type {UserSettingEntity} from '@app/database/entities/user/user-setting.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 로그인 회원 조회 결과 — 회원 컬럼 + 상태의 로그인 가능 여부 (QueryBuilder raw) */
export interface LoginUserRow {
    user_id: string;
    login_id: string;
    name: string;
    gender: string;
    birth: string;
    nickname: string;
    auth_id: string;
    store_id: string | null;
    state_id: string;
    is_login_able: number;
}

/**
 * 회원 repository 포트.
 * WHERE 는 service 가 만들고 repository 는 실행 + DB 오류 변환만 한다.
 * insert · update 의 엔티티는 호출자가 `new XEntity()` + 필드 할당으로 만든다(@BeforeInsert/@BeforeUpdate 트리거).
 */
export interface UserRepositoryInterface {
    insertUser(entity: UserEntity): Promise<void>;
    insertUserSetting(entity: UserSettingEntity): Promise<void>;
    insertSession(entity: SessionEntity): Promise<void>;
    insertSessionRefresh(entity: SessionRefreshEntity): Promise<void>;
    findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    findUsers(where: FindOptionsWhere<UserEntity>): Promise<UserEntity[]>;
    findLoginUser(user_id: string): Promise<LoginUserRow | null>;
    findSession(where: FindOptionsWhere<SessionEntity>): Promise<SessionEntity | null>;
    findSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>): Promise<SessionRefreshEntity | null>;
    updateSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>, entity: SessionRefreshEntity): Promise<void>;
    updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
}
