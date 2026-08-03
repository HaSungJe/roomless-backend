import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from "typeorm";
import { AuthEntity } from "./auth.entity";
import { StateEntity } from "./state.entity";
import { SnsEntity } from "./sns.entity";
import { StoreEntity } from "@root/api/v1/store/entities/store.entity";

@Entity({name: 't_user', comment: '사용자 정보'})
@Unique('UK_User_LoginId', ['login_id'])
@Unique('UK_User_UserSearchCode', ['user_search_code'])
@Unique('UK_User_SnsSnsUserId', ['sns_id', 'sns_user_id'])
export class UserEntity {
    @PrimaryColumn({name: 'user_id', length: 32, comment: '사용자 ID', primaryKeyConstraintName: 'PK_User'})
    user_id: string;

    @Column({name: 'user_search_code', length: 32, nullable: false, comment: '회원 식별 코드'})
    user_search_code: string;

    @ManyToOne(() => AuthEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'auth_id', referencedColumnName: 'auth_id', foreignKeyConstraintName: 'FK_User_Auth'})
    auth_id: string;
    
    @ManyToOne(() => StateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'state_id', referencedColumnName: 'state_id', foreignKeyConstraintName: 'FK_User_State'})
    state_id: string;

    @ManyToOne(() => SnsEntity, {nullable: true, onUpdate: 'CASCADE', onDelete: 'RESTRICT'})
    @JoinColumn({name: 'sns_id', referencedColumnName: 'sns_id', foreignKeyConstraintName: 'FK_User_Sns'})
    sns_id: string | null;

    @Column({name: 'sns_user_id', length: 255, nullable: true, comment: 'SNS 사용자 ID'})
    sns_user_id: string | null;

    @ManyToOne(() => StoreEntity, {nullable: true, onUpdate: 'CASCADE', onDelete: 'RESTRICT'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_User_Store'})
    store_id: string | null;

    @Column({name: 'login_id', length: 100, nullable: false, comment: '로그인 ID'})
    login_id: string;

    @Column({name: 'login_pw', length: 100, nullable: false, comment: '비밀번호'})
    login_pw: string;

    @Column({name: 'name', length: 50, nullable: false, comment: '이름'})
    name: string;

    @Column({name: 'gender', length: 10, nullable: false, comment: '성별'}) 
    gender: string;

    @Column({name: 'birth', length: 30, nullable: false, comment: '생년월일'})
    birth: string;

    @Column({name: 'phone', length: 30, nullable: true, comment: '전화번호'})
    phone: string | null;

    @Column({name: 'nickname', length: 50, nullable: false, comment: '닉네임'})
    nickname: string;

    @Column({name: 'device_os', length: 20, nullable: true, comment: '디바이스 OS'})
    device_os: string | null;

    @Column({name: 'device_token', length: 255, nullable: true, comment: '디바이스 토큰'})
    device_token: string | null;

    @Column({name: 'is_password_change_required', type: 'tinyint', nullable: false, comment: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요)', default: 0})
    is_password_change_required: number;

    @Column({name: 'block_comment', length: 255, nullable: true, comment: '정지 사유'})
    block_comment: string | null;

    @Column({name: 'leave_comment', length: 255, nullable: true, comment: '탈퇴 사유'})
    leave_comment: string | null;

    @Column({name: 'leave_reserved_at', length: 40, nullable: true, comment: '탈퇴 예약시각(dayjs YYYY-MM-DD HH:mm:ss 문자열)'})
    leave_reserved_at: string | null;

    @Column({name: 'leave_prev_state_id', length: 20, nullable: true, comment: '탈퇴 직전 상태(철회 복원용 스냅샷, FK 아님)'})
    leave_prev_state_id: string | null;

    @Column({name: 'leave_backup', type: 'mediumtext', nullable: true, comment: '삭제 완료 시 이전 정보 백업(JSON)'})
    leave_backup: string | null;

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