import {randomUUID} from 'node:crypto';
import {ILike, LessThan, MoreThan} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {dayjs} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';
import {toContainsPattern} from '@app/common/utils/search.js';
import type {StoreApplicationApplicantResultDto, StoreApplicationDetailFileResultDto, StoreApplicationDetailResultDto} from '@app/contracts/store/dto/store-application-detail.dto.js';
import type {StoreApplicationListDto, StoreApplicationListItemResultDto} from '@app/contracts/store/dto/store-application-list.dto.js';
import type {StoreDetailFileResultDto, StoreDetailResultDto} from '@app/contracts/store/dto/store-detail.dto.js';
import type {StoreListDto, StoreListItemResultDto} from '@app/contracts/store/dto/store-list.dto.js';
import type {StoreMineBreakDto} from '@app/contracts/store/dto/store-mine-breaks.dto.js';
import type {StoreMineHourDto} from '@app/contracts/store/dto/store-mine-hours.dto.js';
import type {StoreMineUnavailablePeriodItemResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period-list.dto.js';
import type {StoreMineBreakItemResultDto, StoreMineFileItemResultDto, StoreMineHourItemResultDto, StoreMineResultDto} from '@app/contracts/store/dto/store-mine.dto.js';
import type {StoreMyApplicationItemResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import type {StoreMyApplicationFileResultDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import type {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {StoreFileRow} from './interfaces/store.repository.interface.js';
import {STORE_FILE_EXTENSION, STORE_FILE_PURPOSE} from './store.constants.js';

/**
 * 입점 신청 목록 WHERE — 상태 + 검색어(상호명 · 사업자등록번호 OR).
 *
 * @param dto 목록 query
 * @returns WHERE 배열 (OR)
 */
export function buildApplicationListWhere(dto: StoreApplicationListDto): FindOptionsWhere<StoreApplicationEntity>[] {
    const base: FindOptionsWhere<StoreApplicationEntity> = dto.store_application_state_id ? {store_application_state_id: dto.store_application_state_id} : {};
    if (!dto.keyword) {
        return [base];
    }
    const pattern = toContainsPattern(dto.keyword);
    return [
        {...base, store_name: ILike(pattern)},
        {...base, business_number: ILike(pattern)},
    ];
}

/**
 * 업체 목록 WHERE — 상태 + 검색어(상호명 · 사업자등록번호 · 대표자명 OR).
 *
 * @param dto 목록 query
 * @returns WHERE 배열 (OR)
 */
export function buildStoreListWhere(dto: StoreListDto): FindOptionsWhere<StoreEntity>[] {
    const base: FindOptionsWhere<StoreEntity> = dto.store_state_id ? {store_state_id: dto.store_state_id} : {};
    if (!dto.keyword) {
        return [base];
    }
    const pattern = toContainsPattern(dto.keyword);
    return [
        {...base, store_name: ILike(pattern)},
        {...base, business_number: ILike(pattern)},
        {...base, owner_name: ILike(pattern)},
    ];
}

/**
 * 신청 때 올리는 업체 정보 파일의 저장 키 접두 — 비공개 용도는 private/(CDN 이 읽지 못한다), 공개 용도는 store/(CDN).
 *
 * @param is_private 용도의 비공개 여부 (t_store_file_purpose.is_private)
 * @param store_application_id 입점 신청 ID
 * @returns 접두 (끝에 / 없음)
 */
function applicationFilePrefix(is_private: number, store_application_id: string): string {
    return is_private === 1 ? `private/store-application/${store_application_id}` : `store/application/${store_application_id}`;
}

/**
 * 새 저장 키 — `<접두>/<uuid 32자>.<jpg|png>`. 업로드마다 새 키다(같은 키를 덮어쓰지 않는다 — CDN 캐시).
 *
 * @param prefix 접두 (끝에 / 없음)
 * @param content_type MIME 타입
 * @returns 저장 키
 */
function issueFileKey(prefix: string, content_type: string): string {
    return `${prefix}/${randomUUID().replace(/-/g, '')}.${STORE_FILE_EXTENSION[content_type]}`;
}

/**
 * 키가 그 접두 · 형식으로 발급한 모양(`<접두>/<uuid 32자>.<확장자>`)인지 — 남의 신청 · 업체 키나 다른 접두를 막는다.
 *
 * @param file_key 등록하려는 키
 * @param prefix 접두 (끝에 / 없음)
 * @param content_type MIME 타입
 * @returns 맞으면 true
 */
function isIssuedFileKey(file_key: string, prefix: string, content_type: string): boolean {
    const extension = STORE_FILE_EXTENSION[content_type];
    return Boolean(extension) && file_key.startsWith(`${prefix}/`) && new RegExp(`^[a-f0-9]{32}\\.${extension}$`).test(file_key.slice(prefix.length + 1));
}

/**
 * 신청 때 올리는 업체 정보 파일의 저장 키 — `<접두>/<uuid 32자>.<jpg|png>`. 업로드마다 새 키다(같은 키를 덮어쓰지 않는다 — CDN 캐시).
 *
 * @param is_private 용도의 비공개 여부
 * @param store_application_id 입점 신청 ID
 * @param content_type MIME 타입 (image/jpeg · image/png)
 * @returns 저장 키
 */
export function buildApplicationFileKey(is_private: number, store_application_id: string, content_type: string): string {
    return issueFileKey(applicationFilePrefix(is_private, store_application_id), content_type);
}

/**
 * 등록하려는 키가 그 신청 · 용도(비공개 여부) · 형식으로 발급한 키 모양인지 — 남의 신청 키나 다른 접두를 막는다.
 *
 * @param file_key 등록하려는 키
 * @param is_private 용도의 비공개 여부
 * @param store_application_id 입점 신청 ID
 * @param content_type MIME 타입
 * @returns 맞으면 true
 */
export function isApplicationFileKey(file_key: string, is_private: number, store_application_id: string, content_type: string): boolean {
    return isIssuedFileKey(file_key, applicationFilePrefix(is_private, store_application_id), content_type);
}

/**
 * 업체에 올리는 업체 정보 파일의 저장 키 접두 — 비공개 용도는 private/store/(CDN 이 읽지 못한다), 공개 용도는 store/(CDN).
 *
 * @param is_private 용도의 비공개 여부 (t_store_file_purpose.is_private)
 * @param store_id 업체 ID
 * @returns 접두 (끝에 / 없음)
 */
function storeFilePrefix(is_private: number, store_id: string): string {
    return is_private === 1 ? `private/store/${store_id}` : `store/${store_id}`;
}

/**
 * 업체 관리자가 올리는 업체 사진의 저장 키 — `<접두>/<uuid 32자>.<jpg|png>`(업로드마다 새 키).
 *
 * @param is_private 용도의 비공개 여부
 * @param store_id 업체 ID
 * @param content_type MIME 타입 (image/jpeg · image/png)
 * @returns 저장 키
 */
export function buildStoreFileKey(is_private: number, store_id: string, content_type: string): string {
    return issueFileKey(storeFilePrefix(is_private, store_id), content_type);
}

/**
 * 등록하려는 키가 그 업체 · 용도(비공개 여부) · 형식으로 발급한 키 모양인지.
 *
 * @param file_key 등록하려는 키
 * @param is_private 용도의 비공개 여부
 * @param store_id 업체 ID
 * @param content_type MIME 타입
 * @returns 맞으면 true
 */
export function isStoreFileKey(file_key: string, is_private: number, store_id: string, content_type: string): boolean {
    return isIssuedFileKey(file_key, storeFilePrefix(is_private, store_id), content_type);
}

/**
 * 업체 정보 파일 행 중 업체 사진만.
 *
 * @param rows 업체의 업체 정보 파일 행
 * @returns 업체 사진 행 (원래 순서)
 */
export function filterStoreImages(rows: StoreFileRow[]): StoreFileRow[] {
    return rows.filter((row) => row.store_file_purpose_id === STORE_FILE_PURPOSE.STORE_IMAGE);
}

/**
 * 새 업체 사진의 정렬 순서 — 지금 사진의 가장 큰 순서 + 1, 없으면 0. 삭제로 빈 번호가 있어도 마지막에 붙는다.
 *
 * @param images 지금 업체 사진 행
 * @returns 정렬 순서
 */
export function nextSortOrder(images: StoreFileRow[]): number {
    return images.length > 0 ? Math.max(...images.map((row) => Number(row.sort_order))) + 1 : 0;
}

/**
 * 받은 ID 목록이 지금 ID 전부를 빠짐 · 남음 · 겹침 없이 담았는지 (순서 무관).
 *
 * @param ids 받은 ID 목록
 * @param current 지금 ID 목록
 * @returns 같은 집합이면 true
 */
export function isSameIdSet(ids: string[], current: string[]): boolean {
    return ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
}

/**
 * 요일별 영업시간이 일 ~ 토 7개 요일을 한 번씩 담았는지 (요일 값은 DTO 가 0 ~ 6 으로 검증한다).
 *
 * @param hours 요일별 영업시간 입력
 * @returns 7개가 한 번씩이면 true
 */
export function hasEveryDayOnce(hours: StoreMineHourDto[]): boolean {
    return hours.length === 7 && new Set(hours.map((hour) => hour.day_of_week)).size === 7;
}

/**
 * 하루 안 시각('HH:mm' · 'HH:mm:ss')을 기준일(2000-01-01, UTC) 위의 dayjs 로 — 하루 안 시각끼리 비교 · 다음 날 넘김 계산에 쓴다(날짜 · 서버 시간대와 무관).
 *
 * @param time 하루 안 시각
 * @returns 기준일 위 시각
 */
function toTimeOfDay(time: string): Dayjs {
    return dayjs.utc(`2000-01-01 ${time}`);
}

/**
 * 하루 안 시각 두 개가 같은지 — 'HH:mm' · 'HH:mm:ss' 를 섞어도 된다.
 *
 * @param a 하루 안 시각
 * @param b 하루 안 시각
 * @returns 같으면 true
 */
export function isSameTimeOfDay(a: string, b: string): boolean {
    return toTimeOfDay(a).isSame(toTimeOfDay(b));
}

/**
 * 매일 반복하는 시각 범위를 기준일 위 [시작, 마감) 으로 — 마감이 시작보다 늦지 않으면 다음 날 마감(23:00 ~ 02:00 · 23:30 ~ 00:00).
 *
 * @param start_time 시작 'HH:mm'
 * @param end_time 마감 'HH:mm'
 * @returns [시작, 마감)
 */
function toDailyRange(start_time: string, end_time: string): [Dayjs, Dayjs] {
    const start = toTimeOfDay(start_time);
    const end = toTimeOfDay(end_time);
    return [start, end.isAfter(start) ? end : end.add(1, 'day')];
}

/**
 * 브레이크타임끼리 겹치는지 — 매일 반복이라 한쪽을 하루 앞 · 뒤로도 옮겨 비교한다(자정을 넘는 범위가 다음 날 이른 범위와 겹치는 경우 — 23:00 ~ 02:00 + 01:00 ~ 03:00).
 * 반열린 구간이라 끝점이 맞닿는 것(09:00 ~ 09:30 + 09:30 ~ 10:00 · 23:30 ~ 00:00 + 00:00 ~ 00:30)은 겹침이 아니다. 입력 순서와 무관.
 * 시작 = 마감인 항목은 미리 걸러야 한다(하루 전체로 본다).
 *
 * @param breaks 브레이크타임 입력
 * @returns 한 쌍이라도 겹치면 true
 */
export function hasOverlappingBreaks(breaks: StoreMineBreakDto[]): boolean {
    const ranges = breaks.map((item) => toDailyRange(item.start_time, item.end_time));
    return ranges.some(([aStart, aEnd], i) =>
        ranges.slice(i + 1).some(([bStart, bEnd]) => [-1, 0, 1].some((days) => aStart.isBefore(bEnd.add(days, 'day')) && bStart.add(days, 'day').isBefore(aEnd))),
    );
}

/**
 * 일시 예약불가 겹침 WHERE — 그 업체의 다른 범위 중 시작 < 새 종료 그리고 종료 > 새 시작(반열린 구간 — 맞닿는 것은 겹침 아님).
 *
 * @param store_id 업체 ID
 * @param starts_at 새 시작 일시
 * @param ends_at 새 종료 일시
 * @returns WHERE
 */
export function buildUnavailablePeriodOverlapWhere(store_id: string, starts_at: Date, ends_at: Date): FindOptionsWhere<StoreUnavailablePeriodEntity> {
    return {store_id, starts_at: LessThan(ends_at), ends_at: MoreThan(starts_at)};
}

/**
 * 입점 승인 안내 SMS 본문 — 아이디 · 비밀번호는 신청자가 정했고 업체코드는 내 신청에서 보인다.
 *
 * @param store_name 상호명
 * @returns 본문
 */
export function storeApprovedText(store_name: string): string {
    return `[roomless] ${store_name} 입점이 승인되었습니다.`;
}

/**
 * 내 입점 신청 목록 항목
 *
 * @param entity 입점 신청
 * @param store_code 승인 신청이면 그 업체의 코드, 아니면 null
 * @returns 목록 항목
 */
export function toMyApplicationItem(entity: StoreApplicationEntity, store_code: string | null): StoreMyApplicationItemResultDto {
    return {
        store_application_id: entity.store_application_id,
        store_application_state_id: entity.store_application_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        reject_comment: entity.reject_comment ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
        store_code,
    };
}

/**
 * 내 입점 신청의 업체 정보 파일 항목
 *
 * @param row 파일 행
 * @param file_url 열람 주소
 * @returns 파일 항목
 */
export function toMyApplicationFile(row: StoreFileRow, file_url: string): StoreMyApplicationFileResultDto {
    return {
        store_file_id: row.store_file_id,
        store_file_purpose_id: row.store_file_purpose_id,
        file_name: row.file_name,
        content_type: row.content_type,
        is_private: Number(row.is_private),
        file_url,
        created_at: new Date(row.created_at).toISOString(),
    };
}

/**
 * 내 입점 신청 상세
 *
 * @param entity 입점 신청
 * @param store_code 승인 신청이면 그 업체의 코드, 아니면 null
 * @param files 파일 항목
 * @returns 상세
 */
export function toMyApplicationDetail(entity: StoreApplicationEntity, store_code: string | null, files: StoreMyApplicationFileResultDto[]): StoreMyApplicationResultDto {
    return {
        store_application_id: entity.store_application_id,
        store_application_state_id: entity.store_application_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail ?? null,
        latitude: entity.latitude,
        longitude: entity.longitude,
        owner_phone: entity.owner_phone,
        head_manager_login_id: entity.head_manager_login_id,
        application_comment: entity.application_comment ?? null,
        reject_comment: entity.reject_comment ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
        store_code,
        files,
    };
}

/**
 * 입점 신청 목록 항목 (총관리자)
 *
 * @param entity 입점 신청
 * @returns 목록 항목
 */
export function toApplicationListItem(entity: StoreApplicationEntity): StoreApplicationListItemResultDto {
    return {
        store_application_id: entity.store_application_id,
        user_id: entity.user_id,
        store_application_state_id: entity.store_application_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        store_id: entity.store_id ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
    };
}

/**
 * 입점 신청의 업체 정보 파일 항목 (총관리자)
 *
 * @param row 파일 행
 * @param file_url 열람 주소
 * @returns 파일 항목
 */
export function toApplicationDetailFile(row: StoreFileRow, file_url: string): StoreApplicationDetailFileResultDto {
    return {
        store_file_id: row.store_file_id,
        store_file_purpose_id: row.store_file_purpose_id,
        file_name: row.file_name,
        content_type: row.content_type,
        is_private: Number(row.is_private),
        file_url,
        created_at: new Date(row.created_at).toISOString(),
    };
}

/**
 * 신청자 (없으면 null)
 *
 * @param user t_user 이용자 또는 null
 * @returns 신청자 또는 null
 */
export function toApplicant(user: UserEntity | null): StoreApplicationApplicantResultDto | null {
    if (!user) {
        return null;
    }
    return {user_id: user.user_id, name: user.name, nickname: user.nickname, phone: user.phone ?? null};
}

/**
 * 입점 신청 상세 (총관리자)
 *
 * @param entity 입점 신청
 * @param store_code 업체코드 (승인 전 null)
 * @param applicant 신청자
 * @param files 파일 항목
 * @returns 상세
 */
export function toApplicationDetail(
    entity: StoreApplicationEntity,
    store_code: string | null,
    applicant: StoreApplicationApplicantResultDto | null,
    files: StoreApplicationDetailFileResultDto[],
): StoreApplicationDetailResultDto {
    return {
        store_application_id: entity.store_application_id,
        user_id: entity.user_id,
        store_application_state_id: entity.store_application_state_id,
        store_id: entity.store_id ?? null,
        store_code,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail ?? null,
        latitude: entity.latitude,
        longitude: entity.longitude,
        owner_phone: entity.owner_phone,
        head_manager_login_id: entity.head_manager_login_id,
        application_comment: entity.application_comment ?? null,
        reject_comment: entity.reject_comment ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
        applicant,
        files,
    };
}

/**
 * 업체 목록 항목
 *
 * @param entity 업체
 * @returns 목록 항목
 */
export function toStoreListItem(entity: StoreEntity): StoreListItemResultDto {
    return {
        store_id: entity.store_id,
        store_code: entity.store_code,
        store_state_id: entity.store_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        is_open: entity.is_open,
        created_at: entity.created_at.toISOString(),
    };
}

/**
 * 업체의 업체 정보 파일 항목 (총관리자)
 *
 * @param row 파일 행
 * @param file_url 열람 주소
 * @returns 파일 항목
 */
export function toStoreDetailFile(row: StoreFileRow, file_url: string): StoreDetailFileResultDto {
    return {
        store_file_id: row.store_file_id,
        store_file_purpose_id: row.store_file_purpose_id,
        file_name: row.file_name,
        content_type: row.content_type,
        is_private: Number(row.is_private),
        file_url,
        sort_order: Number(row.sort_order),
        created_at: new Date(row.created_at).toISOString(),
    };
}

/**
 * 업체 상세 (총관리자)
 *
 * @param entity 업체
 * @param files 파일 항목
 * @returns 상세
 */
export function toStoreDetail(entity: StoreEntity, files: StoreDetailFileResultDto[]): StoreDetailResultDto {
    return {
        store_id: entity.store_id,
        store_code: entity.store_code,
        store_state_id: entity.store_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail ?? null,
        latitude: entity.latitude,
        longitude: entity.longitude,
        introduction: entity.introduction ?? null,
        is_always_open: entity.is_always_open,
        is_open: entity.is_open,
        maintenance_minutes: entity.maintenance_minutes,
        booking_open_hours: entity.booking_open_hours,
        refund_deadline_hours: entity.refund_deadline_hours,
        suspend_comment: entity.suspend_comment ?? null,
        created_at: entity.created_at.toISOString(),
        updated_at: entity.updated_at.toISOString(),
        files,
    };
}

/**
 * time 컬럼 값('HH:mm:ss') → 'HH:mm'.
 *
 * @param time 하루 안 시각
 * @returns 'HH:mm'
 */
function toHourMinute(time: string): string {
    return toTimeOfDay(time).format('HH:mm');
}

/**
 * 내 업체의 요일 영업시간 항목 — 휴무면 시각 null.
 *
 * @param entity 요일 영업시간
 * @returns 항목
 */
export function toMineHourItem(entity: StoreHourEntity): StoreMineHourItemResultDto {
    return {
        day_of_week: entity.day_of_week,
        is_closed: entity.is_closed,
        open_time: entity.open_time ? toHourMinute(entity.open_time) : null,
        close_time: entity.close_time ? toHourMinute(entity.close_time) : null,
    };
}

/**
 * 내 업체의 브레이크타임 항목.
 *
 * @param entity 브레이크타임
 * @returns 항목
 */
export function toMineBreakItem(entity: StoreBreakEntity): StoreMineBreakItemResultDto {
    return {store_break_id: entity.store_break_id, start_time: toHourMinute(entity.start_time), end_time: toHourMinute(entity.end_time)};
}

/**
 * 내 업체의 업체 정보 파일 항목.
 *
 * @param row 파일 행
 * @param file_url 열람 주소
 * @returns 항목
 */
export function toMineFileItem(row: StoreFileRow, file_url: string): StoreMineFileItemResultDto {
    return {
        store_file_id: row.store_file_id,
        store_file_purpose_id: row.store_file_purpose_id,
        file_name: row.file_name,
        content_type: row.content_type,
        is_private: Number(row.is_private),
        file_url,
        sort_order: Number(row.sort_order),
        created_at: new Date(row.created_at).toISOString(),
    };
}

/**
 * 내 업체 상세 (업체 관리자).
 *
 * @param entity 업체
 * @param hours 요일별 영업시간 항목
 * @param breaks 브레이크타임 항목
 * @param files 파일 항목
 * @returns 상세
 */
export function toMineDetail(entity: StoreEntity, hours: StoreMineHourItemResultDto[], breaks: StoreMineBreakItemResultDto[], files: StoreMineFileItemResultDto[]): StoreMineResultDto {
    return {
        store_id: entity.store_id,
        store_code: entity.store_code,
        store_state_id: entity.store_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail ?? null,
        latitude: entity.latitude,
        longitude: entity.longitude,
        introduction: entity.introduction ?? null,
        is_always_open: entity.is_always_open,
        is_open: entity.is_open,
        maintenance_minutes: entity.maintenance_minutes,
        booking_open_hours: entity.booking_open_hours,
        refund_deadline_hours: entity.refund_deadline_hours,
        suspend_comment: entity.suspend_comment ?? null,
        hours,
        breaks,
        files,
        updated_at: entity.updated_at.toISOString(),
    };
}

/**
 * 일시 예약불가 목록 항목.
 *
 * @param entity 일시 예약불가
 * @returns 항목
 */
export function toUnavailablePeriodItem(entity: StoreUnavailablePeriodEntity): StoreMineUnavailablePeriodItemResultDto {
    return {
        store_unavailable_period_id: entity.store_unavailable_period_id,
        starts_at: entity.starts_at.toISOString(),
        ends_at: entity.ends_at.toISOString(),
        memo: entity.memo ?? null,
        created_at: entity.created_at.toISOString(),
    };
}
