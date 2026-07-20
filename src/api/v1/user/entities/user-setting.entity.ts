import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from "typeorm";
import { UserEntity } from "./user.entity";

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
