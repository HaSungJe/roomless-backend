import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_state', comment: '상태 정보'})
export class StateEntity {
    @PrimaryColumn({name: 'state_id', length: 20, comment: '상태 ID', primaryKeyConstraintName: 'PK_State'})
    state_id: string;

    @Column({name: 'state_name', length: 50, nullable: false, comment: '상태명'})
    state_name: string;

    @Column({name: 'is_login_able', type: 'smallint', nullable: false, default: 1, comment: '로그인 가능여부(0: 불가, 1: 가능)'})
    is_login_able: number;
}
