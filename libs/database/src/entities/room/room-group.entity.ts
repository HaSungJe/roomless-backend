import {AfterLoad, BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from '../store/store.entity.js';

/**
 * 객실 그룹 상세정보(t_room_group.room_group_detail) — 항목은 언제든 바뀔 수 있다(인터페이스 · 기본값만 고치고 마이그레이션 없음).
 * 저장된 JSON 에는 항목이 빠져 있을 수 있다(나중에 더한 항목) — 조회 뒤 ROOM_GROUP_DETAIL_DEFAULTS 로 채운 값이라 항목이 모두 있다.
 */
export interface RoomGroupDetail {
    /** 객실 안의 방 개수(원룸 1 · 투룸 2) */
    room_count: number;
    /** 샤워실 유무(0: 없음, 1: 있음) */
    has_shower: 0 | 1;
    /** TV 유무(0: 없음, 1: 있음) */
    has_tv: 0 | 1;
    /** PC 유무(0: 없음, 1: 있음) */
    has_pc: 0 | 1;
}

/** 객실 그룹 상세정보 기본값 — 저장된 JSON 에 없는 항목은 조회 뒤 이 값으로 채운다(@AfterLoad). 엔티티로 읽지 않는 곳(raw select)도 이 상수로 채운다 */
export const ROOM_GROUP_DETAIL_DEFAULTS: RoomGroupDetail = {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 1};

/**
 * 객실 그룹 — 객실의 유형. 같은 상품 · 가격을 쓰는 호실 묶음이고, 유형별 상세정보는 JSON(room_group_detail) 하나로 관리한다.
 * 상품 설정은 업체 공통(t_room_plan), 가격 · 사용 여부는 그룹 상품(t_room_group_plan).
 * 지울 때는 삭제 표시(is_deleted = 1)로 남긴다 — 예약이 호실 · 그룹 상품을 가리킨다. 그룹명은 업체 안에서 지워지지 않은 그룹끼리 유일하다.
 */
@Entity({name: 't_room_group', comment: '객실 그룹'})
@Index('UK_RoomGroup_StoreIdRoomGroupName', ['store_id', 'room_group_name'], {unique: true, where: '"is_deleted" = 0'})
export class RoomGroupEntity {
    @PrimaryColumn({name: 'room_group_id', length: 32, comment: '객실 그룹 ID', primaryKeyConstraintName: 'PK_RoomGroup'})
    room_group_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_RoomGroup_Store'})
    store_id: string;

    @Column({name: 'room_group_name', length: 100, nullable: false, comment: '그룹명(업체 안에서 지워지지 않은 그룹끼리 유일)'})
    room_group_name: string;

    @Column({name: 'description', type: 'text', nullable: true, comment: '설명'})
    description: string | null;

    @Column({
        name: 'room_group_detail',
        type: 'jsonb',
        nullable: false,
        default: () => "'{}'",
        comment: '상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다. 없는 항목은 조회 뒤 기본값 — 방 1 · 나머지 1)',
    })
    room_group_detail: RoomGroupDetail;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 예약 이력 때문에 행을 남긴다)'})
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

    /**
     * 조회 직후 상세정보의 빈 항목을 기본값으로 채운다 — 나중에 더한 항목도 기존 행을 고치지 않고 기본값으로 보인다.
     */
    @AfterLoad()
    fillDetailDefaults(): void {
        this.room_group_detail = {...ROOM_GROUP_DETAIL_DEFAULTS, ...this.room_group_detail};
    }
}
