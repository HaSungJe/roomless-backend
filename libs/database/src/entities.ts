import {ApiLogEntity} from './entities/api-log/api-log.entity.js';
import {RoomGroupImageEntity} from './entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from './entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from './entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from './entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from './entities/room/room-plan-type.entity.js';
import {RoomPlanEntity} from './entities/room/room-plan.entity.js';
import {RoomStateEntity} from './entities/room/room-state.entity.js';
import {RoomEntity} from './entities/room/room.entity.js';
import {StoreApplicationStateEntity} from './entities/store/store-application-state.entity.js';
import {StoreApplicationEntity} from './entities/store/store-application.entity.js';
import {StoreBreakEntity} from './entities/store/store-break.entity.js';
import {StoreFilePurposeEntity} from './entities/store/store-file-purpose.entity.js';
import {StoreFileEntity} from './entities/store/store-file.entity.js';
import {StoreHourEntity} from './entities/store/store-hour.entity.js';
import {StoreStateEntity} from './entities/store/store-state.entity.js';
import {StoreUnavailablePeriodEntity} from './entities/store/store-unavailable-period.entity.js';
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
export const ENTITIES = [
    AuthEntity,
    StateEntity,
    SnsEntity,
    SmsPurposeEntity,
    StoreStateEntity,
    StoreApplicationStateEntity,
    StoreFilePurposeEntity,
    StoreEntity,
    StoreApplicationEntity,
    StoreFileEntity,
    StoreHourEntity,
    StoreBreakEntity,
    StoreUnavailablePeriodEntity,
    RoomStateEntity,
    RoomPlanTypeEntity,
    RoomPlanEntity,
    RoomGroupEntity,
    RoomGroupImageEntity,
    RoomEntity,
    RoomGroupPlanEntity,
    RoomGroupPlanPriceEntity,
    UserEntity,
    UserSettingEntity,
    SessionEntity,
    SessionRefreshEntity,
    SmsVerificationEntity,
    ApiLogEntity,
];
