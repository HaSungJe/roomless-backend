import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({name: 't_sns', comment: 'SNS 정보'})
export class SnsEntity {
    @PrimaryColumn({name: 'sns_id', comment: 'SNS ID', length: 20, primaryKeyConstraintName: 'PK_Sns'})
    sns_id: string;

    @Column({name: 'sns_name', comment: 'SNS명', length: 50, nullable: false})
    sns_name: string;
}
