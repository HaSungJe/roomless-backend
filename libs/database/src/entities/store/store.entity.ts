import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {StoreStateEntity} from './store-state.entity.js';

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
 * 업체 — 입점 승인으로 만들어진다. 이용자에게는 활성(ACTIVE) · 미삭제 업체만 보인다.
 * 영업중 = 영업중 여부(is_open) 1 이고, 24시간 연중무휴(is_always_open) 이거나 요일별 영업시간(t_store_hour) 안 · 브레이크타임 밖.
 * is_open 이 0 이면 연중무휴로 되어 있어도 영업중 아님이다.
 */
@Entity({name: 't_store', comment: '업체 정보'})
@Unique('UK_Store_BusinessNumber', ['business_number'])
@Index('IDX_Store_LatitudeLongitude', ['latitude', 'longitude'])
export class StoreEntity {
    @PrimaryColumn({name: 'store_id', length: 32, comment: '업체 ID', primaryKeyConstraintName: 'PK_Store'})
    store_id: string;

    @ManyToOne(() => StoreStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_state_id', referencedColumnName: 'store_state_id', foreignKeyConstraintName: 'FK_Store_StoreState'})
    store_state_id: string;

    @Column({name: 'store_name', length: 100, nullable: false, comment: '상호명'})
    store_name: string;

    @Column({name: 'business_number', length: 45, nullable: false, comment: '사업자등록번호(숫자 10자리, 삭제 시 DELETE_<store_id> 로 마스킹)'})
    business_number: string;

    @Column({name: 'owner_name', length: 50, nullable: false, comment: '대표자명'})
    owner_name: string;

    @Column({name: 'phone', length: 30, nullable: false, comment: '업체 연락처'})
    phone: string;

    @Column({name: 'address', length: 255, nullable: false, comment: '주소'})
    address: string;

    @Column({name: 'address_detail', type: 'varchar', length: 255, nullable: true, comment: '상세주소'})
    address_detail: string | null;

    @Column({name: 'latitude', type: 'double precision', nullable: false, comment: '위도(WGS84)'})
    latitude: number;

    @Column({name: 'longitude', type: 'double precision', nullable: false, comment: '경도(WGS84)'})
    longitude: number;

    @Column({name: 'introduction', type: 'text', nullable: true, comment: '업체 소개'})
    introduction: string | null;

    @Column({name: 'store_detail', type: 'jsonb', nullable: false, default: () => "'{}'", comment: '업체 상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다)'})
    store_detail: StoreDetail;

    @Column({name: 'is_always_open', type: 'smallint', nullable: false, default: 0, comment: '24시간 연중무휴 여부(0: 요일별 영업시간 t_store_hour, 1: 24시간 연중무휴 — 영업시간을 두지 않는다)'})
    is_always_open: number;

    @Column({name: 'is_open', type: 'smallint', nullable: false, default: 1, comment: '영업중 여부(0: 영업중 아님 — 연중무휴 · 영업시간과 무관하게 영업중 아님으로 본다, 1: 영업중)'})
    is_open: number;

    @Column({name: 'maintenance_minutes', type: 'smallint', nullable: false, default: 0, comment: '정비시간(분) — 퇴실 후 다음 이용까지 호실을 막는 시간'})
    maintenance_minutes: number;

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
