import { FindOptionsWhere } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserSettingEntity } from '../entities/user-setting.entity';
import { SessionEntity } from '../entities/session.entity';
import { SessionRefreshEntity } from '../entities/session-refresh.entity';

export interface UserRepositoryInterface {
    insertUser(entity: UserEntity): Promise<void>;
    insertUserSetting(entity: UserSettingEntity): Promise<void>;
    insertSession(entity: SessionEntity): Promise<void>;
    insertSessionRefresh(entity: SessionRefreshEntity): Promise<void>;
    findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    findLeaveReadyUsers(now: string): Promise<UserEntity[]>;
    findSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>): Promise<SessionRefreshEntity | null>;
    updateSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>, entity: SessionRefreshEntity): Promise<void>;
    updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
}
