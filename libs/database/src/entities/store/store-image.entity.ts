import {BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 사진 — 사진 1장 = 1행. 파일은 S3(presigned 업로드)에 있고 저장 키만 둔다. 화면 주소는 getPublicUrl(key)
 */
@Entity({name: 't_store_image', comment: '업체 사진'})
@Index('IDX_StoreImage_StoreIdSortOrder', ['store_id', 'sort_order'])
export class StoreImageEntity {
    @PrimaryColumn({name: 'store_image_id', length: 32, comment: '업체 사진 ID', primaryKeyConstraintName: 'PK_StoreImage'})
    store_image_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreImage_Store'})
    store_id: string;

    @Column({name: 'image_key', length: 255, nullable: false, comment: '사진 저장 키(S3 — store/<store_id>/<uuid>.jpg)'})
    image_key: string;

    @Column({name: 'sort_order', type: 'smallint', nullable: false, default: 0, comment: '정렬 순서(작을수록 앞, 0: 대표 사진)'})
    sort_order: number;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    created_at: Date;

    /**
     * insert 직전 등록일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        this.created_at = new Date();
    }
}
