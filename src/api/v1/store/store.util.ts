import { FindOptionsWhere, Like } from 'typeorm';
import { StoreEntity } from './entities/store.entity';

/**
 * 가맹점 검색 WHERE 조립.
 * search_type / search_keyword 가 모두 있을 때만 검색 조건을 걸고, 그 외에는 삭제되지 않은 전체를 대상으로 한다.
 * ALL 은 상호명·사업자등록번호·대표자명의 OR — TypeORM 은 where 배열을 OR 로 해석한다.
 */
export function buildStoreSearchWhere(search_type: string | null, search_keyword: string | null): FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[] {
    if (!search_type || !search_keyword) {
        return {is_delete: 0};
    }

    const keyword = Like(`%${search_keyword}%`);
    if (search_type === 'STORE_NAME') {
        return {is_delete: 0, store_name: keyword};
    } else if (search_type === 'BUSINESS_NUMBER') {
        return {is_delete: 0, business_number: keyword};
    } else if (search_type === 'OWNER_NAME') {
        return {is_delete: 0, owner_name: keyword};
    } else {
        return [
            {is_delete: 0, store_name: keyword},
            {is_delete: 0, business_number: keyword},
            {is_delete: 0, owner_name: keyword},
        ];
    }
}

/**
 * 삭제 직전 스냅샷 직렬화 — 마스킹되기 전 원본 사업자등록번호를 포함한다.
 */
export function buildStoreDeleteBackup(entity: StoreEntity): string {
    return JSON.stringify({
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail,
        create_at: entity.create_at,
    });
}
