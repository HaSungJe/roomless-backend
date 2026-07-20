import { Module, SetMetadata } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeORMModule } from '@root/modules/typeorm/typeorm.module';
import { PassportJwtAuthModule } from '@root/guards/passport.jwt.auth/passport.jwt.auth.module';
import { AuthEntity } from './entities/auth.entity';
import { StateEntity } from './entities/state.entity';
import { SnsEntity } from './entities/sns.entity';
import { UserEntity } from './entities/user.entity';
import { UserSettingEntity } from './entities/user-setting.entity';
import { SessionEntity } from './entities/session.entity';
import { SessionRefreshEntity } from './entities/session-refresh.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserLeaveCleanupService } from './user.leave-cleanup.service';
import { UserRepository } from './repositories/user.repository';
import { USER_REPOSITORY } from './user.symbols';

@SetMetadata('type', 'API')
@SetMetadata('description', '회원')
@SetMetadata('path', 'user')
@Module({
    imports: [
        TypeORMModule,
        TypeOrmModule.forFeature([
            AuthEntity,
            StateEntity,
            SnsEntity,
            UserEntity,
            UserSettingEntity,
            SessionEntity,
            SessionRefreshEntity,
        ]),
        PassportJwtAuthModule,
    ],
    controllers: [UserController],
    providers: [
        UserService,
        UserLeaveCleanupService,
        {provide: USER_REPOSITORY, useClass: UserRepository},
    ],
})
export class UserModule {}
