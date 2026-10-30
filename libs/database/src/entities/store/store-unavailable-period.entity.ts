import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 일시 예약불가 — 시작 일시 ~ 종료 일시(분 단위, 반열린 구간) 동안 예약을 받지 않는다. 요일별 휴무(t_store_hour.is_closed)와 별개다.
 * 한 업체의 범위끼리는 겹치지 않는다(service 가 확인 — 맞닿는 것은 겹침이 아니다). 수정 없이 삭제 후 다시 등록한다.
 * 걸리는 기존 예약은 취소하지 않고 특수 표시한다(예약 기능 — Phase 17).
 */
@Entity({name: 't_store_unavailable_period', comment: '업체 일시 예약불가'})
@Index('IDX_StoreUnavailablePeriod_StoreIdStartsAt', ['store_id', 'starts_at'])
@Check('CHK_StoreUnavailablePeriod_StartsAtEndsAt', '"starts_at" < "ends_at"')
export class StoreUnavailablePeriodEntity {
    @PrimaryColumn({name: 'store_unavailable_period_id', length: 32, comment: '일시 예약불가 ID', primaryKeyConstraintName: 'PK_StoreUnavailablePeriod'})
    store_unavailable_period_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreUnavailablePeriod_Store'})
    store_id: string;

    @Column({name: 'starts_at', type: 'timestamptz', nullable: false, comment: '시작 일시(분 단위 — 이 시각부터 예약을 받지 않는다)'})
    starts_at: Date;

    @Column({name: 'ends_at', type: 'timestamptz', nullable: false, comment: '종료 일시(분 단위 — 이 시각부터 다시 예약을 받는다, 시작보다 늦다)'})
    ends_at: Date;

    @Column({name: 'memo', type: 'varchar', length: 30, nullable: true, comment: '메모(간단한 사유, 30자)'})
    memo: string | null;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 겹침 검사는 정상 행끼리)'})
    is_deleted: number;

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
