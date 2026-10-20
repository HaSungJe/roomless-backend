import {BeforeInsert, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {UserEntity} from './user.entity.js';

/**
 * 로그인 세션 — 로그인 1회 = 1행
 */
@Entity({name: 't_session', comment: '로그인 세션 정보'})
export class SessionEntity {
    @PrimaryColumn({name: 'session_id', length: 32, comment: '세션 ID (UUID v4)', primaryKeyConstraintName: 'PK_Session'})
    session_id: string;

    @ManyToOne(() => UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_Session_User'})
    user_id: string;

    @Column({name: 'ip', type: 'varchar', length: 100, nullable: true, comment: '접속 IP'})
    ip: string | null;

    @Column({name: 'device_os', type: 'varchar', length: 20, nullable: true, comment: '디바이스 OS'})
    device_os: string | null;

    @Column({name: 'device_token', type: 'varchar', length: 255, nullable: true, comment: '디바이스 토큰'})
    device_token: string | null;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제)'})
    is_deleted: number;

    @Column({name: 'login_at', type: 'timestamptz', nullable: false, comment: '로그인일'})
    login_at: Date;

    @Column({name: 'logout_at', type: 'timestamptz', nullable: true, comment: '로그아웃일'})
    logout_at: Date | null;

    /**
     * insert 직전 로그인일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        this.login_at = new Date();
    }
}
