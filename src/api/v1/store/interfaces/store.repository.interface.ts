import { FindOptionsWhere } from 'typeorm';
import { StoreEntity } from '../entities/store.entity';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { UserSettingEntity } from '@root/api/v1/user/entities/user-setting.entity';

export interface StoreRepositoryInterface {
    insertStore(entity: StoreEntity): Promise<void>;
    countStore(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number>;
    findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]>;
    findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]>;
    updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void>;

    insertStaff(entity: UserEntity): Promise<void>;
    insertStaffSetting(entity: UserSettingEntity): Promise<void>;
    findStaff(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    countStaff(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number>;
    findStaffList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]>;
    updateStaff(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
}
