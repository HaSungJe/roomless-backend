import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 요일별 브레이크타임 — 하루 여러 개, 연중무휴 업체도 둘 수 있다.
 * 시각은 한국 시각 분 단위이고, 마감이 시작보다 이르면 다음 날까지다(23:00 ~ 02:00 — 시작한 요일에 속한다).
 */
@Entity({name: 't_store_break', comment: '업체 요일별 브레이크타임'})
@Index('IDX_StoreBreak_StoreIdDayOfWeek', ['store_id', 'day_of_week'])
export class StoreBreakEntity {
    @PrimaryColumn({name: 'store_break_id', length: 32, comment: '브레이크타임 ID', primaryKeyConstraintName: 'PK_StoreBreak'})
    store_break_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreBreak_Store'})
    store_id: string;

    @Column({name: 'day_of_week', type: 'smallint', nullable: false, comment: '요일(0: 일 ~ 6: 토) — 브레이크타임이 시작하는 요일'})
    day_of_week: number;

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
