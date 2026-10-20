import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {SmsPurposeEntity} from './sms-purpose.entity.js';
import {UserEntity} from './user.entity.js';

/**
 * SMS 인증 발송 · 확인 기록 — 발송 1건 = 1행. 인증번호는 해시로만 남기고, 확인 시도 · 완료 시각을 쌓는다.
 * 같은 번호 하루 발송 수를 (phone, created_at) 으로 센다.
 */
@Entity({name: 't_sms_verification', comment: 'SMS 인증 발송 · 확인 기록'})
@Index('IDX_SmsVerification_PhoneCreatedAt', ['phone', 'created_at'])
export class SmsVerificationEntity {
    @PrimaryColumn({name: 'sms_verification_id', length: 32, comment: 'SMS 인증 ID', primaryKeyConstraintName: 'PK_SmsVerification'})
    sms_verification_id: string;

    @ManyToOne(() => SmsPurposeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'sms_purpose_id', referencedColumnName: 'sms_purpose_id', foreignKeyConstraintName: 'FK_SmsVerification_SmsPurpose'})
    sms_purpose_id: string;

    @ManyToOne(() => UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_SmsVerification_User'})
    user_id: string;

    @Column({name: 'phone', length: 30, nullable: false, comment: '받는 번호(숫자만)'})
    phone: string;

    @Column({name: 'code_hash', length: 64, nullable: false, comment: '인증번호 SHA-256 해시'})
    code_hash: string;

    @Column({name: 'attempt_count', type: 'smallint', nullable: false, default: 0, comment: '확인 시도 횟수'})
    attempt_count: number;

    @Column({name: 'expires_at', type: 'timestamptz', nullable: false, comment: '인증번호 만료일'})
    expires_at: Date;

    @Column({name: 'verified_at', type: 'timestamptz', nullable: true, comment: '인증 완료일(미완료 NULL)'})
    verified_at: Date | null;

    @Column({name: 'ip', type: 'varchar', length: 100, nullable: true, comment: '요청 IP'})
    ip: string | null;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '발송일'})
    created_at: Date;

    @Column({name: 'updated_at', type: 'timestamptz', nullable: false, comment: '수정일'})
    updated_at: Date;

    /**
     * insert 직전 발송일 · 수정일을 채운다.
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
