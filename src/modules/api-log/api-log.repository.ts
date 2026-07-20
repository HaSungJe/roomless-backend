import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { API_LOG_DATASOURCE_NAME } from './api-log.constants';
import { ApiLogEntity } from './api-log.entity';
import { ApiLogRepositoryInterface } from './api-log.repository.interface';

@Injectable()
export class ApiLogRepository implements ApiLogRepositoryInterface {
    constructor(
        // 비즈니스 pool 과 격리된 전용 DataSource 의 Repository 를 사용
        @InjectRepository(ApiLogEntity, API_LOG_DATASOURCE_NAME)
        private readonly apiLogRepository: Repository<ApiLogEntity>,
    ) {}

    /**
     * API 호출 로그 등록
     */
    async insert(entity: ApiLogEntity): Promise<void> {
        try {
            await this.apiLogRepository.insert(entity);
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }
}
