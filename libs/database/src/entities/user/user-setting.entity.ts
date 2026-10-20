import {BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {UserEntity} from './user.entity.js';

/**
 * 회원 설정 — 회원 1명당 1행
 */
@Entity({name: 't_user_setting', comment: '회원 설정'})
@Unique('UK_UserSetting_UserId', ['user_id'])
export class UserSettingEntity {
    @PrimaryColumn({name: 'user_setting_id', length: 32, comment: '회원 설정 ID', primaryKeyConstraintName: 'PK_UserSetting'})
    user_setting_id: string;

    @ManyToOne(() => UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_UserSetting_User'})
    user_id: string;

    @Column({name: 'bio', type: 'text', nullable: true, comment: '자기소개'})
    bio: string | null;

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
