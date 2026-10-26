import type {FindOptionsWhere} from 'typeorm';
import type {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import type {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

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
 * store repository 포트 — 입점 신청 · 업체 · 업체 정보 파일과, store 어휘로 다루는 t_user(신청자 · 업체 총관리자 · 업체 매니저)를 다룬다.
 * WHERE 는 service · util 이 만들고(배열 = OR) repository 는 실행 + DB 오류 변환만 한다.
 * insert · update 의 엔티티는 호출자가 `new XEntity()` + 필드 할당으로 만든다(@BeforeInsert/@BeforeUpdate 트리거).
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
    /** 입점 신청 수정 (승인 · 반려) — 조건에 맞는 행을 바꿨으면 true */
    updateApplication(where: FindOptionsWhere<StoreApplicationEntity>, entity: StoreApplicationEntity): Promise<boolean>;
    /** 입점 신청 삭제 (취소) — 조건에 맞는 행을 지웠으면 true */
    deleteApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<boolean>;
    /** 업체 정보 파일 용도 단건 (비공개 여부) */
    findStoreFilePurpose(store_file_purpose_id: string): Promise<StoreFilePurposeEntity | null>;
    /** 신청의 업체 정보 파일 — 용도 · 정렬 순서, 비공개 여부 포함 */
    findApplicationFileRows(store_application_id: string): Promise<StoreFileRow[]>;
    /** 업체의 업체 정보 파일 — 용도 · 정렬 순서, 비공개 여부 포함 */
    findStoreFileRows(store_id: string): Promise<StoreFileRow[]>;
    /** 업체 정보 파일 개수 — 용도별 한도 · 정렬 순서 · 승인 조건 */
    countStoreFiles(where: FindOptionsWhere<StoreFileEntity>): Promise<number>;
    /** 업체 정보 파일 단건 */
    findStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity | null>;
    /** 업체 정보 파일 등록 — 같은 키 → 400 */
    insertStoreFile(entity: StoreFileEntity): Promise<void>;
    /** 업체 정보 파일 삭제 */
    deleteStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<void>;
    /** 신청의 업체 정보 파일 삭제 (신청 취소) — 아직 업체에 붙지 않은 파일만 */
    deleteApplicationFiles(store_application_id: string): Promise<void>;
    /** 신청의 업체 정보 파일을 업체로 — 승인 때 store_id 를 채운다 */
    assignStoreFiles(store_application_id: string, store_id: string): Promise<void>;
    /** 업체 단건 */
    findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 업체 여러 건 — 내 신청 목록의 업체코드 */
    findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]>;
    /** 업체 개수 — 목록 · 사업자번호 중복 확인 */
    countStores(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number>;
    /** 업체 목록 — 등록일 최신순 */
    findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]>;
    /** 업체 등록 — 사업자번호 UK → 400 */
    insertStore(entity: StoreEntity): Promise<void>;
    /** 업체 수정 (정보 · 상태 · 탈퇴 마스킹) */
    updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void>;
    /** 신청자 — t_user 이용자 그룹 */
    findApplicant(user_id: string): Promise<UserEntity | null>;
    /** 업체 총관리자 계정 등록 (t_user 매니저 그룹) — 아이디 · 휴대폰 번호는 업체 단위라 새 업체에서 겹치지 않는다 */
    insertHeadManager(entity: UserEntity): Promise<void>;
    /** 그 업체 매니저 그룹 회원 상태 변경 (업체 탈퇴 → 정지) */
    updateStoreManagers(store_id: string, state_id: string, block_comment: string | null): Promise<void>;
}
