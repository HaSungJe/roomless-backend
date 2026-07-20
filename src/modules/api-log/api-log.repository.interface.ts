import { ApiLogEntity } from './api-log.entity';

export interface ApiLogRepositoryInterface {
    /**
     * API 호출 로그 등록
     */
    insert(entity: ApiLogEntity): Promise<void>;
}
