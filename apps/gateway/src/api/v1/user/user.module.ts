import {Module} from '@nestjs/common';
import {UserController} from './user.controller.js';

/**
 * 게이트웨이 회원 라우트. 전달 수단(TransportModule)은 전역이라 따로 import 하지 않는다.
 */
@Module({controllers: [UserController]})
export class UserModule {}
