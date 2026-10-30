import type {FindOptionsWhere} from 'typeorm';

/** 소프트 삭제 표시가 있는 엔티티 — is_deleted(0: 정상, 1: 삭제) */
interface SoftDeletable {
    is_deleted: number;
}

/**
 * 지워지지 않은 행만 — 조건에 is_deleted = 0 을 더한다. 배열(OR 조건)이면 조건마다 더한다.
 * is_deleted 가 있는 테이블의 조회 · 개수 · 수정은 repository 가 항상 이 함수로 조건을 감싼다(service 는 조건에 is_deleted 를 넣지 않는다).
 *
 * @param where 조건 (하나 또는 OR 배열)
 * @returns is_deleted = 0 을 더한 조건 (받은 모양 그대로)
 */
export function notDeleted<T extends SoftDeletable>(where: FindOptionsWhere<T>): FindOptionsWhere<T>;
export function notDeleted<T extends SoftDeletable>(where: FindOptionsWhere<T>[]): FindOptionsWhere<T>[];
export function notDeleted<T extends SoftDeletable>(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): FindOptionsWhere<T> | FindOptionsWhere<T>[];
export function notDeleted<T extends SoftDeletable>(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    if (Array.isArray(where)) {
        return where.map((item) => ({...item, is_deleted: 0}) as FindOptionsWhere<T>);
    }
    return {...where, is_deleted: 0} as FindOptionsWhere<T>;
}
