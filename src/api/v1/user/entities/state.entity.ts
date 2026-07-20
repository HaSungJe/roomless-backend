import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({name: 't_state', comment: '상태 정보'})
export class StateEntity {
    @PrimaryColumn({name: 'state_id', comment: '상태 ID', length: 20, primaryKeyConstraintName: 'PK_State'})
    state_id: string;

    @Column({name: 'state_name', comment: '상태명', length: 50, nullable: false})
    state_name: string;

    @Column({name: 'is_login_able', type: 'tinyint', comment: '로그인 가능여부(0: 불가, 1: 가능)', nullable: false, default: 1})
    is_login_able: number;
}