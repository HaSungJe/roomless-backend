import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 입점 신청 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_store_application_state', comment: '입점 신청 상태'})
export class StoreApplicationStateEntity {
    @PrimaryColumn({name: 'store_application_state_id', length: 20, comment: '입점 신청 상태 ID', primaryKeyConstraintName: 'PK_StoreApplicationState'})
    store_application_state_id: string;

    @Column({name: 'store_application_state_name', length: 50, nullable: false, comment: '입점 신청 상태명'})
    store_application_state_name: string;
}
