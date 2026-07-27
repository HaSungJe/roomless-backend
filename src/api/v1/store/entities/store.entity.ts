import { BeforeInsert, BeforeUpdate, Column, Entity, PrimaryColumn, Unique } from "typeorm";

@Entity({name: 't_store', comment: '가맹점 정보'})
@Unique('UK_Store_BusinessNumber', ['business_number'])
export class StoreEntity {
    @PrimaryColumn({name: 'store_id', length: 32, comment: '가맹점 ID (UUID v4)', primaryKeyConstraintName: 'PK_Store'})
    store_id: string;

    @Column({name: 'store_name', length: 100, nullable: false, comment: '상호명'})
    store_name: string;

    @Column({name: 'business_number', length: 45, nullable: false, comment: '사업자등록번호(숫자 10자리, 삭제 시 DELETE_<store_id> 로 마스킹)'})
    business_number: string;

    @Column({name: 'owner_name', length: 50, nullable: false, comment: '대표자명'})
    owner_name: string;

    @Column({name: 'phone', length: 30, nullable: false, comment: '가맹점 연락처'})
    phone: string;

    @Column({name: 'address', length: 255, nullable: false, comment: '주소'})
    address: string;

    @Column({name: 'address_detail', length: 255, nullable: true, comment: '상세주소'})
    address_detail: string | null;

    @Column({name: 'is_delete', type: 'tinyint', nullable: false, comment: '삭제여부(0: 정상, 1: 삭제)', default: 0})
    is_delete: number;

    @Column({name: 'delete_backup', type: 'mediumtext', nullable: true, comment: '삭제 시 이전 정보 백업(JSON)'})
    delete_backup: string | null;

    @Column({name: 'create_at', type: 'timestamp', nullable: false, comment: '등록일'})
    create_at: Date;

    @Column({name: 'update_at', type: 'timestamp', nullable: false, comment: '수정일'})
    update_at: Date;

    @BeforeInsert()
    insertTimestamp() {
        const now = new Date();
        this.create_at = now;
        this.update_at = now;
    }

    @BeforeUpdate()
    updateTimestamp() {
        this.update_at = new Date();
    }
}
