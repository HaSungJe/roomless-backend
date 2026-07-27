import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { v4 } from 'uuid';
import { Pagination } from '@root/common/utils/pagination';
import { StoreEntity } from './entities/store.entity';
import { StoreRegisterDto, StoreRegisterResultDto } from './dto/store-register.dto';
import { StoreListDto, StoreListResultDto } from './dto/store-list.dto';
import { StoreDetailParamDto, StoreDetailResultDto } from './dto/store-detail.dto';
import { StoreModifyParamDto, StoreModifyDto } from './dto/store-modify.dto';
import { StoreRemoveParamDto } from './dto/store-remove.dto';
import { buildStoreSearchWhere, buildStoreDeleteBackup } from './store.util';
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
        storeEntity.delete_backup = null;
        await this.storeRepository.insertStore(storeEntity);

        return {store_id};
    }

    /**
     * 가맹점 목록 조회 — 총 개수를 먼저 세고, Pagination 이 산출한 limit/offset 으로 목록을 가져온다.
     * (Pagination 생성자가 total_count 를 입력으로 받는 구조라 count → list 순서가 강제된다)
     */
    async list(dto: StoreListDto): Promise<StoreListResultDto> {
        // 1. 검색 WHERE 조립 (is_delete=0 고정)
        const where = buildStoreSearchWhere(dto.search_type, dto.search_keyword);

        // 2. 총 개수 → 페이지 계산
        const total_count = await this.storeRepository.countStore(where);
        const pagination = new Pagination({
            all_search_yn: dto.all_search_yn as 'Y' | 'N',
            total_count,
            page: dto.page,
            size: dto.size,
            page_size: dto.page_size,
        });

        // 3. 목록 조회
        const stores = await this.storeRepository.findStoreList(where, pagination.limit, pagination.offset);

        return {
            list: stores.map((store) => ({
                store_id: store.store_id,
                store_name: store.store_name,
                business_number: store.business_number,
                owner_name: store.owner_name,
                phone: store.phone,
                address: store.address,
                address_detail: store.address_detail,
                create_at: store.create_at,
                update_at: store.update_at,
            })),
            pagination: pagination.getPagination(),
        };
    }

    /**
     * 가맹점 상세 조회 — 삭제된 가맹점은 조회 대상이 아니다.
     */
    async detail(param: StoreDetailParamDto): Promise<StoreDetailResultDto> {
        const store = await this.storeRepository.findStore({store_id: param.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        return {
            store_id: store.store_id,
            store_name: store.store_name,
            business_number: store.business_number,
            owner_name: store.owner_name,
            phone: store.phone,
            address: store.address,
            address_detail: store.address_detail,
            create_at: store.create_at,
            update_at: store.update_at,
        };
    }

    /**
     * 가맹점 수정 — 사업자등록번호는 변경 대상이 아니다(DTO 에 필드 자체가 없음).
     */
    @Transactional()
    async modify(param: StoreModifyParamDto, dto: StoreModifyDto): Promise<void> {
        // 1. 대상 확인 (삭제된 가맹점은 수정 불가)
        const store = await this.storeRepository.findStore({store_id: param.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 2. 전달된 필드 전체 덮어쓰기 (address_detail 미전달 시 null — update 는 undefined 를 무시하므로 명시 필요)
        const storeEntity = new StoreEntity();
        storeEntity.store_name = dto.store_name;
        storeEntity.owner_name = dto.owner_name;
        storeEntity.phone = dto.phone;
        storeEntity.address = dto.address;
        storeEntity.address_detail = dto.address_detail ?? null;
        await this.storeRepository.updateStore({store_id: param.store_id}, storeEntity);
    }

    /**
     * 가맹점 삭제 — soft delete + 사업자등록번호 마스킹.
     * business_number 를 DELETE_<store_id> 로 치환해 UK_Store_BusinessNumber 를 비우고,
     * 삭제 직전 스냅샷을 delete_backup 에 남긴다. 같은 사업자등록번호로 재등록이 가능해진다.
     */
    @Transactional()
    async remove(param: StoreRemoveParamDto): Promise<void> {
        // 1. 대상 확인 (이미 삭제된 가맹점은 재삭제 불가)
        const store = await this.storeRepository.findStore({store_id: param.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 2. 백업 + 마스킹 + 삭제 플래그 (나머지 컬럼은 손대지 않는다)
        const storeEntity = new StoreEntity();
        storeEntity.is_delete = 1;
        storeEntity.business_number = `DELETE_${store.store_id}`;
        storeEntity.delete_backup = buildStoreDeleteBackup(store);
        await this.storeRepository.updateStore({store_id: param.store_id}, storeEntity);
    }
}
