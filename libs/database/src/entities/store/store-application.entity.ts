import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreApplicationStateEntity} from './store-application-state.entity.js';
import {StoreEntity} from './store.entity.js';

/**
 * 입점 신청 — 이용자가 신청하고 총관리자가 승인 · 반려한다. 승인하면 업체(t_store)와 업체 총관리자(= 대표자) 계정을 만들고 store_id 를 남긴다.
 * 신청 때 올린 업체 정보 파일(사업자등록증 · 업체 사진)은 t_store_file(store_application_id) — 승인하면 같은 행에 store_id 를 채운다.
 * 신청자 user_id 는 다른 서비스 소유 테이블(t_user)이라 FK 없이 ID 만 둔다(data-layer.md — 서비스 간 FK 를 새로 만들지 않는다).
 */
@Entity({name: 't_store_application', comment: '입점 신청'})
@Index('IDX_StoreApplication_UserId', ['user_id'])
export class StoreApplicationEntity {
    @PrimaryColumn({name: 'store_application_id', length: 32, comment: '입점 신청 ID', primaryKeyConstraintName: 'PK_StoreApplication'})
    store_application_id: string;

    @Column({name: 'user_id', length: 32, nullable: false, comment: '신청한 이용자 ID(t_user — 다른 서비스 소유라 FK 없음)'})
    user_id: string;

    @ManyToOne(() => StoreApplicationStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_application_state_id', referencedColumnName: 'store_application_state_id', foreignKeyConstraintName: 'FK_StoreApplication_StoreApplicationState'})
    store_application_state_id: string;

    @ManyToOne(() => StoreEntity, {nullable: true, onUpdate: 'CASCADE', onDelete: 'RESTRICT'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreApplication_Store'})
    store_id: string | null;

    @Column({name: 'store_name', length: 100, nullable: false, comment: '상호명'})
    store_name: string;

    @Column({name: 'business_number', length: 10, nullable: false, comment: '사업자등록번호(숫자 10자리)'})
    business_number: string;

    @Column({name: 'owner_name', length: 50, nullable: false, comment: '대표자명 — 승인 때 만드는 업체 총관리자(매니저) 계정의 이름'})
    owner_name: string;

    @Column({name: 'owner_phone', length: 30, nullable: false, comment: '대표자 휴대폰 번호(숫자만) — 승인 때 만드는 업체 총관리자(매니저) 계정 · 안내 SMS'})
    owner_phone: string;

    @Column({name: 'head_manager_login_id', length: 30, nullable: false, comment: '업체 총관리자 아이디 — 승인 때 만드는 업체 총관리자(매니저) 계정의 아이디(그 업체 안에서 유일)'})
    head_manager_login_id: string;

    @Column({name: 'head_manager_login_pw', length: 100, nullable: false, comment: '업체 총관리자 비밀번호(bcrypt 해시) — 승인 때 계정에 그대로 옮긴다'})
    head_manager_login_pw: string;

    @Column({name: 'phone', length: 30, nullable: false, comment: '업체 연락처'})
    phone: string;

    @Column({name: 'address', length: 255, nullable: false, comment: '주소'})
    address: string;

    @Column({name: 'address_detail', type: 'varchar', length: 255, nullable: true, comment: '상세주소'})
    address_detail: string | null;

    @Column({name: 'latitude', type: 'double precision', nullable: false, comment: '위도(WGS84 — 클라이언트가 주소 검색으로 구해 보낸다)'})
    latitude: number;

    @Column({name: 'longitude', type: 'double precision', nullable: false, comment: '경도(WGS84 — 클라이언트가 주소 검색으로 구해 보낸다)'})
    longitude: number;

    @Column({name: 'application_comment', type: 'varchar', length: 500, nullable: true, comment: '신청 메모'})
    application_comment: string | null;

    @Column({name: 'reject_comment', type: 'varchar', length: 255, nullable: true, comment: '반려 사유'})
    reject_comment: string | null;

    @Column({name: 'reviewed_at', type: 'timestamptz', nullable: true, comment: '처리일(승인 · 반려, 대기 NULL)'})
    reviewed_at: Date | null;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 신청 취소)'})
    is_deleted: number;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '신청일'})
    created_at: Date;

    @Column({name: 'updated_at', type: 'timestamptz', nullable: false, comment: '수정일'})
    updated_at: Date;

    /**
     * insert 직전 신청일 · 수정일을 채운다.
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
