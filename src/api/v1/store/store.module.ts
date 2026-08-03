import { Module, SetMetadata } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeORMModule } from '@root/modules/typeorm/typeorm.module';
import { PassportJwtAuthModule } from '@root/guards/passport.jwt.auth/passport.jwt.auth.module';
import { StoreEntity } from './entities/store.entity';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { UserSettingEntity } from '@root/api/v1/user/entities/user-setting.entity';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { StoreRepository } from './repositories/store.repository';
import { STORE_REPOSITORY } from './store.symbols';

@SetMetadata('type', 'API')
@SetMetadata('description', '가맹점')
@SetMetadata('path', 'store')
@Module({
    imports: [
        TypeORMModule,
        TypeOrmModule.forFeature([StoreEntity, UserEntity, UserSettingEntity]),
        PassportJwtAuthModule,
    ],
    controllers: [StoreController],
    providers: [
        StoreService,
        {provide: STORE_REPOSITORY, useClass: StoreRepository},
    ],
})
export class StoreModule {}
