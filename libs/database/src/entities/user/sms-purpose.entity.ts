import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * SMS 인증 용도 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_sms_purpose', comment: 'SMS 인증 용도'})
export class SmsPurposeEntity {
    @PrimaryColumn({name: 'sms_purpose_id', length: 20, comment: 'SMS 인증 용도 ID', primaryKeyConstraintName: 'PK_SmsPurpose'})
    sms_purpose_id: string;

    @Column({name: 'sms_purpose_name', length: 50, nullable: false, comment: 'SMS 인증 용도명'})
    sms_purpose_name: string;
}
