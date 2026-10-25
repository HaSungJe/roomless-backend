import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 업체 정보 파일 용도 (룩업) — 기본 데이터는 seeder.targets.ts.
 * is_private 가 저장 키 · 열람 주소를 정한다 — 1 이면 private/ 키 + 서명된 열람 주소(presigned GET), 0 이면 공개 키 + CDN 공개 주소.
 */
@Entity({name: 't_store_file_purpose', comment: '업체 정보 파일 용도'})
export class StoreFilePurposeEntity {
    @PrimaryColumn({name: 'store_file_purpose_id', length: 20, comment: '업체 정보 파일 용도 ID', primaryKeyConstraintName: 'PK_StoreFilePurpose'})
    store_file_purpose_id: string;

    @Column({name: 'store_file_purpose_name', length: 50, nullable: false, comment: '업체 정보 파일 용도명'})
    store_file_purpose_name: string;

    @Column({name: 'is_private', type: 'smallint', nullable: false, default: 0, comment: '비공개 여부(0: 공개 — CDN 공개 주소, 1: 비공개 — private/ 키 · 서명된 열람 주소)'})
    is_private: number;
}
