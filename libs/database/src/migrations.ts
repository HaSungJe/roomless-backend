import {Init1791903600000} from './migrations/1791903600000-Init.js';
import {RenameColumns1792477492198} from './migrations/1792477492198-RenameColumns.js';
import {SmsVerification1792477679219} from './migrations/1792477679219-SmsVerification.js';
import {LoginScopeStoreDetail1792682222497} from './migrations/1792682222497-LoginScopeStoreDetail.js';
import {StoreSchema1792780576432} from './migrations/1792780576432-StoreSchema.js';
import {StoreFile1792953783038} from './migrations/1792953783038-StoreFile.js';
import {StoreCodeManagerScope1793027933626} from './migrations/1793027933626-StoreCodeManagerScope.js';
import {StoreOperation1793037973399} from './migrations/1793037973399-StoreOperation.js';
import {StoreReservationPolicy1793260428802} from './migrations/1793260428802-StoreReservationPolicy.js';
import {RoomSchema1793386485207} from './migrations/1793386485207-RoomSchema.js';
import {RoomState1793400000000} from './migrations/1793400000000-RoomState.js';

/**
 * DataSource 에 등록할 마이그레이션 목록 (실행 순서 = 클래스명 끝의 타임스탬프 순).
 * ESM 에서는 glob 경로 로딩 대신 명시 목록을 쓴다. 새 마이그레이션은 여기에 한 줄 추가한다.
 */
export const MIGRATIONS = [Init1791903600000, RenameColumns1792477492198, SmsVerification1792477679219, LoginScopeStoreDetail1792682222497, StoreSchema1792780576432, StoreFile1792953783038, StoreCodeManagerScope1793027933626, StoreOperation1793037973399, StoreReservationPolicy1793260428802, RoomSchema1793386485207, RoomState1793400000000];
