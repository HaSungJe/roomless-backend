import {ApiLogEntity} from './entities/api-log/api-log.entity.js';
import {StoreEntity} from './entities/store/store.entity.js';
import {AuthEntity} from './entities/user/auth.entity.js';
import {SessionRefreshEntity} from './entities/user/session-refresh.entity.js';
import {SessionEntity} from './entities/user/session.entity.js';
import {SmsPurposeEntity} from './entities/user/sms-purpose.entity.js';
import {SmsVerificationEntity} from './entities/user/sms-verification.entity.js';
import {SnsEntity} from './entities/user/sns.entity.js';
import {StateEntity} from './entities/user/state.entity.js';
import {UserSettingEntity} from './entities/user/user-setting.entity.js';
import {UserEntity} from './entities/user/user.entity.js';

/**
 * DataSource 에 등록할 엔티티 목록 (단일 관리 지점).
 * ESM 에서는 glob 경로 로딩 대신 명시 목록을 쓴다. 새 엔티티는 여기에 한 줄 추가한다.
 */
export const ENTITIES = [AuthEntity, StateEntity, SnsEntity, SmsPurposeEntity, StoreEntity, UserEntity, UserSettingEntity, SessionEntity, SessionRefreshEntity, SmsVerificationEntity, ApiLogEntity];
