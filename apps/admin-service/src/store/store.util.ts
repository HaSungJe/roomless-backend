import {randomInt, randomUUID} from 'node:crypto';
import {ILike} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import type {StoreApplicationApplicantResultDto, StoreApplicationDetailFileResultDto, StoreApplicationDetailResultDto} from '@app/contracts/store/dto/store-application-detail.dto.js';
import type {StoreApplicationListDto, StoreApplicationListItemResultDto} from '@app/contracts/store/dto/store-application-list.dto.js';
import type {StoreDetailFileResultDto, StoreDetailResultDto} from '@app/contracts/store/dto/store-detail.dto.js';
import type {StoreListDto, StoreListItemResultDto} from '@app/contracts/store/dto/store-list.dto.js';
import type {StoreMyApplicationItemResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import type {StoreMyApplicationFileResultDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import type {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {StoreFileRow} from './interfaces/store.repository.interface.js';
import {STORE_FILE_EXTENSION} from './store.constants.js';

/**
 * 검색어를 부분 일치 패턴으로 — `%` · `_` · `\` 는 글자 그대로 찾도록 이스케이프한다(PostgreSQL 기본 이스케이프 문자 `\`).
 *
 * @param keyword 검색어
 * @returns ILike 패턴
 */
export function toContainsPattern(keyword: string): string {
    return `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

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
 * 신청 때 올리는 업체 정보 파일의 저장 키 — `<접두>/<uuid 32자>.<jpg|png>`. 업로드마다 새 키다(같은 키를 덮어쓰지 않는다 — CDN 캐시).
 *
 * @param is_private 용도의 비공개 여부
 * @param store_application_id 입점 신청 ID
 * @param content_type MIME 타입 (image/jpeg · image/png)
 * @returns 저장 키
 */
export function buildApplicationFileKey(is_private: number, store_application_id: string, content_type: string): string {
    return `${applicationFilePrefix(is_private, store_application_id)}/${randomUUID().replace(/-/g, '')}.${STORE_FILE_EXTENSION[content_type]}`;
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
    const prefix = `${applicationFilePrefix(is_private, store_application_id)}/`;
    const extension = STORE_FILE_EXTENSION[content_type];
    return Boolean(extension) && file_key.startsWith(prefix) && new RegExp(`^[a-f0-9]{32}\\.${extension}$`).test(file_key.slice(prefix.length));
}

/**
 * 업체 총관리자 아이디 후보 — `m` + 숫자 8자리.
 *
 * @returns 아이디 후보
 */
export function generateHeadManagerLoginId(): string {
    return `m${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
}

/**
 * 입점 승인 안내 SMS 본문 — 업체명 · 아이디 · 임시 비밀번호.
 *
 * @param store_name 상호명
 * @param login_id 업체 총관리자 아이디
 * @param password 임시 비밀번호
 * @returns 본문
 */
export function storeApprovedText(store_name: string, login_id: string, password: string): string {
    return `[roomless] ${store_name} 입점이 승인되었습니다. 아이디 ${login_id} 임시 비밀번호 ${password} — 로그인 후 비밀번호를 바꿔주세요.`;
}

/**
 * 내 입점 신청 목록 항목
 *
 * @param entity 입점 신청
 * @returns 목록 항목
 */
export function toMyApplicationItem(entity: StoreApplicationEntity): StoreMyApplicationItemResultDto {
    return {
        store_application_id: entity.store_application_id,
        store_application_state_id: entity.store_application_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        reject_comment: entity.reject_comment ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
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
 * @param files 파일 항목
 * @returns 상세
 */
export function toMyApplicationDetail(entity: StoreApplicationEntity, files: StoreMyApplicationFileResultDto[]): StoreMyApplicationResultDto {
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
        application_comment: entity.application_comment ?? null,
        reject_comment: entity.reject_comment ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
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
 * @param applicant 신청자
 * @param files 파일 항목
 * @returns 상세
 */
export function toApplicationDetail(
    entity: StoreApplicationEntity,
    applicant: StoreApplicationApplicantResultDto | null,
    files: StoreApplicationDetailFileResultDto[],
): StoreApplicationDetailResultDto {
    return {
        store_application_id: entity.store_application_id,
        user_id: entity.user_id,
        store_application_state_id: entity.store_application_state_id,
        store_id: entity.store_id ?? null,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail ?? null,
        latitude: entity.latitude,
        longitude: entity.longitude,
        owner_phone: entity.owner_phone,
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
        store_detail: {...entity.store_detail},
        is_always_open: entity.is_always_open,
        is_open: entity.is_open,
        maintenance_minutes: entity.maintenance_minutes,
        created_at: entity.created_at.toISOString(),
        updated_at: entity.updated_at.toISOString(),
        files,
    };
}
