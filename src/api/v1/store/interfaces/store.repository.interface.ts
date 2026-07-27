import { FindOptionsWhere } from 'typeorm';
import { StoreEntity } from '../entities/store.entity';

export interface StoreRepositoryInterface {
    insertStore(entity: StoreEntity): Promise<void>;
    countStore(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number>;
    findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]>;
    findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void>;
}
