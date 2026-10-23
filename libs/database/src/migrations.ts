import {Init1791903600000} from './migrations/1791903600000-Init.js';
import {RenameColumns1792477492198} from './migrations/1792477492198-RenameColumns.js';
import {SmsVerification1792477679219} from './migrations/1792477679219-SmsVerification.js';
import {LoginScopeStoreDetail1792682222497} from './migrations/1792682222497-LoginScopeStoreDetail.js';
import {StoreSchema1792780576432} from './migrations/1792780576432-StoreSchema.js';

/**
 * DataSource 에 등록할 마이그레이션 목록 (실행 순서 = 클래스명 끝의 타임스탬프 순).
 * ESM 에서는 glob 경로 로딩 대신 명시 목록을 쓴다. 새 마이그레이션은 여기에 한 줄 추가한다.
 */
export const MIGRATIONS = [Init1791903600000, RenameColumns1792477492198, SmsVerification1792477679219, LoginScopeStoreDetail1792682222497, StoreSchema1792780576432];
