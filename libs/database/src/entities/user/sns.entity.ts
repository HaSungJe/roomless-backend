import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * SNS 유형 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_sns', comment: 'SNS 정보'})
export class SnsEntity {
    @PrimaryColumn({name: 'sns_id', length: 20, comment: 'SNS ID', primaryKeyConstraintName: 'PK_Sns'})
    sns_id: string;

    @Column({name: 'sns_name', length: 50, nullable: false, comment: 'SNS명'})
    sns_name: string;
}
