import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {RoomGroupEntity} from './room-group.entity.js';

/**
 * 객실 그룹 사진 — 파일 1개 = 1행, 모두 공개(CDN 공개 주소). 업체 사진(t_store_file)과 같은 컬럼 + 삭제 표시다.
 * 저장 키는 업로드마다 새로 만든다 — `store/<store_id>/room-group/<room_group_id>/<uuid 32자>.<jpg|png>`(CDN 은 store/ 접두만 읽는다). 키를 다시 쓰지 않으므로 UK 는 지운 행까지 전체에 건다.
 * 지울 때는 S3 객체를 실제로 지우고, 행은 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제).
 */
@Entity({name: 't_room_group_image', comment: '객실 그룹 사진'})
@Unique('UK_RoomGroupImage_FileKey', ['file_key'])
@Index('IDX_RoomGroupImage_RoomGroupIdSortOrder', ['room_group_id', 'sort_order'])
export class RoomGroupImageEntity {
    @PrimaryColumn({name: 'room_group_image_id', length: 32, comment: '객실 그룹 사진 ID', primaryKeyConstraintName: 'PK_RoomGroupImage'})
    room_group_image_id: string;

    @ManyToOne(() => RoomGroupEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_group_id', referencedColumnName: 'room_group_id', foreignKeyConstraintName: 'FK_RoomGroupImage_RoomGroup'})
    room_group_id: string;

    @Column({name: 'file_key', length: 255, nullable: false, comment: '저장 키(S3 공개 store/<store_id>/room-group/<room_group_id>/…) — 같은 키를 덮어쓰지 않는다'})
    file_key: string;

    @Column({name: 'file_name', length: 255, nullable: false, comment: '원본 파일명'})
    file_name: string;

    @Column({name: 'content_type', length: 100, nullable: false, comment: 'MIME 타입(image/jpeg · image/png)'})
    content_type: string;

    @Column({name: 'sort_order', type: 'smallint', nullable: false, default: 0, comment: '정렬 순서(0부터 — 0 이 대표, 지워지지 않은 사진끼리)'})
    sort_order: number;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, S3 객체는 실제로 지운다)'})
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
     * update 직전 수정일을 갱신한다(정렬 순서 변경 · 삭제 표시).
     */
    @BeforeUpdate()
    updateTimestamp(): void {
        this.updated_at = new Date();
    }
}
