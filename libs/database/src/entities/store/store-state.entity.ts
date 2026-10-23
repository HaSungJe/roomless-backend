import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 업체 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_store_state', comment: '업체 상태'})
export class StoreStateEntity {
    @PrimaryColumn({name: 'store_state_id', length: 20, comment: '업체 상태 ID', primaryKeyConstraintName: 'PK_StoreState'})
    store_state_id: string;

    @Column({name: 'store_state_name', length: 50, nullable: false, comment: '업체 상태명'})
    store_state_name: string;
}
