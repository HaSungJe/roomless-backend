import { randomInt } from 'crypto';
import { FindOptionsWhere, In, Like, Not } from 'typeorm';
import { StoreEntity } from './entities/store.entity';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';

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

/** 임시 비밀번호 문자 풀 — 혼동 문자(I/l/O/0/1) 제외 */
const TEMP_PW_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMP_PW_LOWER = 'abcdefghijkmnpqrstuvwxyz';
const TEMP_PW_DIGIT = '23456789';
const TEMP_PW_SPECIAL = '!@#$%^&*';

/**
 * 인력 계정용 임시 비밀번호 생성 (12자).
 * 기존 비밀번호 정규식(영문+숫자 필수, 8~20자, 특수문자 !@#$%^&*)을 반드시 만족해야 한다 —
 * 발급 직후 이 값으로 로그인해야 하기 때문. 각 풀에서 1자씩 보장한 뒤 채우고 섞는다.
 */
export function generateTemporaryPassword(): string {
    const pools = [TEMP_PW_UPPER, TEMP_PW_LOWER, TEMP_PW_DIGIT, TEMP_PW_SPECIAL];
    const chars: string[] = pools.map((pool) => pool[randomInt(pool.length)]);
    const all = pools.join('');
    while (chars.length < 12) {
        chars.push(all[randomInt(all.length)]);
    }

    // 앞 4자리가 항상 대문자·소문자·숫자·특수문자 순서가 되지 않도록 섞는다
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

/**
 * 인력 검색 WHERE 조립.
 * 인력 = auth_id 가 HEAD_MANAGER/MANAGER 이고 LEAVE 가 아닌 계정. USER·ADMIN 은 대상이 아니다.
 * 검색어는 login_id·name·nickname 의 OR — TypeORM 은 where 배열을 OR 로 해석하므로
 * AND 조건(소속·역할·상태)을 각 원소에 모두 실어야 한다.
 */
export function buildStaffSearchWhere(store_id: string | null, auth_id: string | null, search_keyword: string | null): FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[] {
    const base: FindOptionsWhere<UserEntity> = {
        auth_id: auth_id ? auth_id : In(['HEAD_MANAGER', 'MANAGER']),
        state_id: Not('LEAVE'),
    };
    if (store_id) {
        base.store_id = store_id;
    }

    if (!search_keyword) {
        return base;
    }

    const keyword = Like(`%${search_keyword}%`);
    return [
        {...base, login_id: keyword},
        {...base, name: keyword},
        {...base, nickname: keyword},
    ];
}
