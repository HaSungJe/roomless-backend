import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 권한 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_auth', comment: '권한 정보'})
export class AuthEntity {
    @PrimaryColumn({name: 'auth_id', length: 20, comment: '권한 ID', primaryKeyConstraintName: 'PK_Auth'})
    auth_id: string;

    @Column({name: 'auth_name', length: 50, nullable: false, comment: '권한명'})
    auth_name: string;

    @Column({name: 'level', type: 'integer', nullable: false, default: 1, comment: '등급'})
    level: number;
}
