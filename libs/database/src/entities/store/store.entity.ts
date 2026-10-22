import {BeforeInsert, BeforeUpdate, Column, Entity, PrimaryColumn, Unique} from 'typeorm';

/** 업체 상세정보(t_store.store_detail) — 항목은 언제든 바뀔 수 있다. 플래그는 0/1 */
export interface StoreDetail {
    /** 방 칸수 */
    room_count?: number;
    /** 샤워실 유무 */
    has_shower?: number;
    /** TV 유무 */
    has_tv?: number;
    /** PC 유무 */
    has_pc?: number;
}

/**
 * 가맹점
 */
@Entity({name: 't_store', comment: '가맹점 정보'})
@Unique('UK_Store_BusinessNumber', ['business_number'])
export class StoreEntity {
    @PrimaryColumn({name: 'store_id', length: 32, comment: '가맹점 ID (UUID v4)', primaryKeyConstraintName: 'PK_Store'})
    store_id: string;

    @Column({name: 'store_name', length: 100, nullable: false, comment: '상호명'})
    store_name: string;

    @Column({name: 'business_number', length: 45, nullable: false, comment: '사업자등록번호(숫자 10자리, 삭제 시 DELETE_<store_id> 로 마스킹)'})
    business_number: string;

    @Column({name: 'owner_name', length: 50, nullable: false, comment: '대표자명'})
    owner_name: string;

    @Column({name: 'phone', length: 30, nullable: false, comment: '가맹점 연락처'})
    phone: string;

    @Column({name: 'address', length: 255, nullable: false, comment: '주소'})
    address: string;

    @Column({name: 'address_detail', type: 'varchar', length: 255, nullable: true, comment: '상세주소'})
    address_detail: string | null;

    @Column({name: 'store_detail', type: 'jsonb', nullable: false, default: () => "'{}'", comment: '업체 상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다)'})
    store_detail: StoreDetail;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제)'})
    is_deleted: number;

    @Column({name: 'delete_backup', type: 'text', nullable: true, comment: '삭제 시 이전 정보 백업(JSON)'})
    delete_backup: string | null;

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
     * update 직전 수정일을 갱신한다.
     */
    @BeforeUpdate()
    updateTimestamp(): void {
        this.updated_at = new Date();
    }
}
