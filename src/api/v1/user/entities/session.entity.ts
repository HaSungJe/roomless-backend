import { BeforeInsert, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { UserEntity } from "./user.entity";

@Entity({name: 't_session', comment: '로그인 세션 정보'})
export class SessionEntity {
    @PrimaryColumn({name: 'session_id', length: 32, comment: '세션 ID (UUID v4)', primaryKeyConstraintName: 'PK_Session'})
    session_id: string;

    @ManyToOne(() =>  UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_Session_User'})
    user_id: string;

    @Column({name: 'ip', length: 100, nullable: true, comment: 'ip'})
    ip: string;

    @Column({name: 'device_os', length: 20, nullable: true, comment: '디바이스 OS'})
    device_os: string;

    @Column({name: 'device_token', length: 255, nullable: true, comment: '디바이스 토큰'})
    device_token: string;

    @Column({name: 'is_delete', type: 'tinyint', nullable: false, comment: '삭제여부(0: 정상, 1: 삭제)', default: 0})
    is_delete: number;

    @Column({name: 'login_at', type: 'timestamp', nullable: false, comment: '로그인일'})
    login_at: Date;

    @Column({name: 'logout_at', type: 'timestamp', nullable: true, comment: '수정일'})
    logout_at: string;

    @BeforeInsert()
    insertTimestamp() {
        this.login_at = new Date();
    }
}