import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {StoreApplicationEntity} from './store-application.entity.js';
import {StoreFilePurposeEntity} from './store-file-purpose.entity.js';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 정보 파일 — 파일 1개 = 1행(사업자등록증 · 업체 사진). 업체의 정보다.
 * 입점 신청 때는 신청(store_application_id)에 붙여 올리고(대기 중에만 추가 · 삭제), 승인하면 같은 행에 업체(store_id)를 채운다 — 파일을 옮기거나 복사하지 않는다.
 * 승인 뒤 업체 관리자가 올리는 업체 사진은 업체에만 붙는다(store_application_id 없음). 사업자등록증은 승인 뒤 바꾸지 않는다.
 * 비공개 여부는 용도(t_store_file_purpose.is_private)가 정한다.
 * 지울 때는 S3 객체를 실제로 지우고, 행은 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제). 저장 키는 다시 쓰지 않으므로 UK 는 전체 행에 건다.
 */
@Entity({name: 't_store_file', comment: '업체 정보 파일'})
@Unique('UK_StoreFile_FileKey', ['file_key'])
@Index('IDX_StoreFile_StoreApplicationIdSortOrder', ['store_application_id', 'sort_order'])
@Index('IDX_StoreFile_StoreIdSortOrder', ['store_id', 'sort_order'])
export class StoreFileEntity {
    @PrimaryColumn({name: 'store_file_id', length: 32, comment: '업체 정보 파일 ID', primaryKeyConstraintName: 'PK_StoreFile'})
    store_file_id: string;

    @ManyToOne(() => StoreFilePurposeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_file_purpose_id', referencedColumnName: 'store_file_purpose_id', foreignKeyConstraintName: 'FK_StoreFile_StoreFilePurpose'})
    store_file_purpose_id: string;

    @ManyToOne(() => StoreApplicationEntity, {nullable: true, onUpdate: 'CASCADE', onDelete: 'RESTRICT'})
    @JoinColumn({name: 'store_application_id', referencedColumnName: 'store_application_id', foreignKeyConstraintName: 'FK_StoreFile_StoreApplication'})
    store_application_id: string | null;

    @ManyToOne(() => StoreEntity, {nullable: true, onUpdate: 'CASCADE', onDelete: 'RESTRICT'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreFile_Store'})
    store_id: string | null;

    @Column({
        name: 'file_key',
        length: 255,
        nullable: false,
        comment: '저장 키(S3 — 비공개 private/store-application/… · private/store/…, 공개 store/application/… · store/<store_id>/…) — 같은 키를 덮어쓰지 않는다',
    })
    file_key: string;

    @Column({name: 'file_name', length: 255, nullable: false, comment: '원본 파일명'})
    file_name: string;

    @Column({name: 'content_type', length: 100, nullable: false, comment: 'MIME 타입(image/jpeg · image/png)'})
    content_type: string;

    @Column({name: 'sort_order', type: 'smallint', nullable: false, default: 0, comment: '정렬 순서(용도 안에서 0부터 — 업체 사진은 0 이 대표)'})
    sort_order: number;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, S3 객체는 실제로 지운다)'})
    is_deleted: number;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    created_at: Date;

    @Column({name: 'updated_at', type: 'timestamptz', nullable: false, comment: '수정일'})
    updated_at: Date;

    /**
     * insert 직전 등록일 · 수정일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        const now = new Date();
        this.created_at = now;
        this.updated_at = now;
    }

    /**
     * update 직전 수정일을 갱신한다(정렬 순서 변경 · 업체 지정 · 삭제 표시).
     */
    @BeforeUpdate()
    updateTimestamp(): void {
        this.updated_at = new Date();
    }
}
