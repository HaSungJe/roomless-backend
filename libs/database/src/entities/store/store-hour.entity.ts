import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 요일별 영업시간 — 요일마다 1행, 24시간 연중무휴(t_store.is_always_open = 1)가 아닌 업체만 둔다.
 * 시각은 한국 시각 분 단위이고, 마감이 시작보다 이르면 다음 날 마감이다(18:00 ~ 06:00).
 * 휴무가 아니면(is_closed = 0) open_time · close_time 은 세트로 둘 다 있다. 휴무(is_closed = 1)면 둘 다 NULL.
 * 교체는 기존 행을 삭제 표시(is_deleted = 1)한 뒤 새 행을 넣는다 — 요일 유일성은 지워지지 않은 행끼리(부분 유니크 인덱스).
 */
@Entity({name: 't_store_hour', comment: '업체 요일별 영업시간'})
@Index('UK_StoreHour_StoreIdDayOfWeek', ['store_id', 'day_of_week'], {unique: true, where: '"is_deleted" = 0'})
@Check('CHK_StoreHour_OpenCloseTime', `("is_closed" = 1 AND "open_time" IS NULL AND "close_time" IS NULL) OR ("is_closed" = 0 AND "open_time" IS NOT NULL AND "close_time" IS NOT NULL)`)
export class StoreHourEntity {
    @PrimaryColumn({name: 'store_hour_id', length: 32, comment: '영업시간 ID', primaryKeyConstraintName: 'PK_StoreHour'})
    store_hour_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreHour_Store'})
    store_id: string;

    @Column({name: 'day_of_week', type: 'smallint', nullable: false, comment: '요일(0: 일 ~ 6: 토)'})
    day_of_week: number;

    @Column({name: 'is_closed', type: 'smallint', nullable: false, default: 0, comment: '휴무 여부(0: 영업, 1: 휴무 — 시각 NULL)'})
    is_closed: number;

    @Column({name: 'open_time', type: 'time', nullable: true, comment: '영업 시작 시각(한국 시각, 분 단위 — 휴무가 아니면 close_time 과 세트로 필수, 휴무 NULL)'})
    open_time: string | null;

    @Column({name: 'close_time', type: 'time', nullable: true, comment: '영업 마감 시각(한국 시각, 분 단위 — 시작보다 이르면 다음 날 마감, 휴무가 아니면 open_time 과 세트로 필수, 휴무 NULL)'})
    close_time: string | null;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 교체 때 기존 행을 삭제 표시)'})
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
