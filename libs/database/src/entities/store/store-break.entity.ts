import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 브레이크타임 — 요일과 상관없이 매일 같은 시각, 업체마다 여러 개. 연중무휴 업체도 둘 수 있다.
 * 시각은 한국 시각 분 단위이고, 마감이 시작보다 이르면 다음 날까지다(23:00 ~ 02:00).
 * 한 업체의 브레이크타임끼리는 겹치지 않는다(service 가 확인 — 끝점이 맞닿는 것은 겹침이 아니다). 시작 = 마감은 두지 않는다.
 */
@Entity({name: 't_store_break', comment: '업체 브레이크타임(매일)'})
@Index('IDX_StoreBreak_StoreId', ['store_id'])
export class StoreBreakEntity {
    @PrimaryColumn({name: 'store_break_id', length: 32, comment: '브레이크타임 ID', primaryKeyConstraintName: 'PK_StoreBreak'})
    store_break_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreBreak_Store'})
    store_id: string;

    @Column({name: 'start_time', type: 'time', nullable: false, comment: '브레이크 시작 시각(한국 시각, 분 단위)'})
    start_time: string;

    @Column({name: 'end_time', type: 'time', nullable: false, comment: '브레이크 마감 시각(한국 시각, 분 단위 — 시작보다 이르면 다음 날)'})
    end_time: string;

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
