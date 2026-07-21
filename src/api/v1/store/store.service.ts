import { Inject, Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { v4 } from 'uuid';
import { StoreEntity } from './entities/store.entity';
import { StoreRegisterDto, StoreRegisterResultDto } from './dto/store-register.dto';
import { STORE_REPOSITORY } from './store.symbols';
import type { StoreRepositoryInterface } from './interfaces/store.repository.interface';

@Injectable()
export class StoreService {
    constructor(
        @Inject(STORE_REPOSITORY)
        private readonly storeRepository: StoreRepositoryInterface,
    ) {}

    /**
     * 가맹점 등록 — 관리자(SUPER_ADMIN/ADMIN)가 가맹점 header 정보를 등록하고 생성된 ID 를 반환.
     */
    @Transactional()
    async register(dto: StoreRegisterDto): Promise<StoreRegisterResultDto> {
        // 1. ID 생성
        const store_id = v4().replace(/-/g, '');

        // 2. t_store 생성 (사업자등록번호 중복은 UK_Store_BusinessNumber 분기 400)
        const storeEntity = new StoreEntity();
        storeEntity.store_id = store_id;
        storeEntity.store_name = dto.store_name;
        storeEntity.business_number = dto.business_number;
        storeEntity.owner_name = dto.owner_name;
        storeEntity.phone = dto.phone;
        storeEntity.address = dto.address;
        storeEntity.address_detail = dto.address_detail ?? null;
        storeEntity.is_delete = 0;
        await this.storeRepository.insertStore(storeEntity);

        return {store_id};
    }
}
