import {BeforeInsert, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique} from 'typeorm';
import {SessionEntity} from './session.entity.js';

/**
 * 로그인 세션 refresh — 재발급마다 1행, before_refresh_hash 로 체인 연결
 */
@Entity({name: 't_session_refresh', comment: '로그인 세션 refresh'})
@Unique('UK_SessionRefresh_RefreshHash', ['refresh_hash'])
export class SessionRefreshEntity {
    @PrimaryGeneratedColumn({name: 'session_refresh_id', type: 'bigint', comment: '로그인 refresh ID', primaryKeyConstraintName: 'PK_SessionRefresh'})
    session_refresh_id: string;

    @ManyToOne(() => SessionEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'session_id', referencedColumnName: 'session_id', foreignKeyConstraintName: 'FK_SessionRefresh_Session'})
    session_id: string;

    @Column({name: 'refresh_hash', length: 64, nullable: false, comment: 'refresh-token SHA-256 해시 (조회용)'})
    refresh_hash: string;

    @Column({name: 'refresh_encrypted', length: 1024, nullable: false, comment: 'refresh-token AES-256-GCM 암호문 (복원용)'})
    refresh_encrypted: string;

    @Column({name: 'before_refresh_hash', type: 'varchar', length: 64, nullable: true, comment: '직전 refresh-token 해시 (체인 링크, 최초 발급 시 NULL)'})
    before_refresh_hash: string | null;

    @Column({name: 'create_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    create_at: Date;

    @Column({name: 'end_at', type: 'timestamptz', nullable: false, comment: '만료일'})
    end_at: Date;

    /**
     * insert 직전 등록일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        this.create_at = new Date();
    }
}
