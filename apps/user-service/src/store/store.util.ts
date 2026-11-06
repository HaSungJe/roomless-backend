import {randomUUID} from 'node:crypto';
import type {StoreMyApplicationItemResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import type {StoreMyApplicationFileResultDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import type {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {StoreFileRow} from './interfaces/store.repository.interface.js';
import {STORE_FILE_EXTENSION} from './store.constants.js';

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
