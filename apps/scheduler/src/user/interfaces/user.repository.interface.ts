import type {FindOptionsWhere} from 'typeorm';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/**
 * scheduler 의 회원 repository 포트 — crontab 이 쓰는 조회 · 수정만 둔다.
 * 공유 DB 단계라 user-service 와 같은 엔티티(t_user)를 다룬다.
 */
export interface UserRepositoryInterface {
    /** 회원 목록 조회 — FK 는 loadRelationIds 로 ID 를 채운다 */
    findUsers(where: FindOptionsWhere<UserEntity>): Promise<UserEntity[]>;
    /** 회원 정보 수정 — new UserEntity() + 할당으로 호출(@BeforeUpdate updated_at 트리거) */
    updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
}
