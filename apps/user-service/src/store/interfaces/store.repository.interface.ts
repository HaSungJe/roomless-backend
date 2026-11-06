import type {FindOptionsWhere} from 'typeorm';
import type {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import type {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 업체 정보 파일 조회 행 — 파일 컬럼 + 용도의 비공개 여부 (QueryBuilder raw — t_store_file_purpose 조인) */
export interface StoreFileRow {
    store_file_id: string;
    store_file_purpose_id: string;
    store_application_id: string | null;
    store_id: string | null;
    file_key: string;
    file_name: string;
    content_type: string;
    sort_order: number;
    created_at: Date;
    is_private: number;
}

/**
 * store repository 포트 (이용자 입점 신청) — 공유 DB 의 t_store_application · t_store_file · t_store_file_purpose · t_store 를 다룬다.
 * WHERE 는 service 가 만들고(배열 = OR) repository 는 is_deleted = 0 을 붙여 실행 + DB 오류 변환만 한다.
 * insert 의 엔티티는 호출자가 `new XEntity()` + 필드 할당으로 만든다(@BeforeInsert 트리거).
 */
export interface StoreRepositoryInterface {
    /** 입점 신청 단건 */
    findApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<StoreApplicationEntity | null>;
    /** 입점 신청 개수 — 목록 · 중복 확인 */
    countApplications(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[]): Promise<number>;
    /** 입점 신청 목록 — 신청일 최신순 */
    findApplicationList(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[], limit: number, offset: number): Promise<StoreApplicationEntity[]>;
    /** 입점 신청 등록 */
    insertApplication(entity: StoreApplicationEntity): Promise<void>;
    /** 입점 신청 삭제 (취소) — 삭제 표시(소프트 삭제), 조건에 맞는 행을 지웠으면 true */
    deleteApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<boolean>;
    /** 업체 정보 파일 용도 단건 (비공개 여부) */
    findStoreFilePurpose(store_file_purpose_id: string): Promise<StoreFilePurposeEntity | null>;
    /** 신청의 업체 정보 파일 — 용도 · 정렬 순서, 비공개 여부 포함 */
    findApplicationFileRows(store_application_id: string): Promise<StoreFileRow[]>;
    /** 업체 정보 파일 개수 — 용도별 한도 · 정렬 순서 · 승인 조건 */
    countStoreFiles(where: FindOptionsWhere<StoreFileEntity>): Promise<number>;
    /** 업체 정보 파일 단건 */
    findStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity | null>;
    /** 업체 정보 파일 등록 — 같은 키 → 400 */
    insertStoreFile(entity: StoreFileEntity): Promise<void>;
    /** 업체 정보 파일 삭제 — 삭제 표시(소프트 삭제, S3 객체는 service 가 지운다) */
    deleteStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<void>;
    /** 신청의 업체 정보 파일 삭제 (신청 취소) — 아직 업체에 붙지 않은 파일만 삭제 표시(소프트 삭제) */
    deleteApplicationFiles(store_application_id: string): Promise<void>;
    /** 업체 단건 */
    findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 업체 여러 건 — 내 신청 목록의 업체코드 */
    findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]>;
    /** 업체 개수 — 목록 · 사업자번호 중복 확인 */
    countStores(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number>;
}
