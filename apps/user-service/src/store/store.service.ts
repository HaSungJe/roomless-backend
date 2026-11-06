import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {In} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {generateId} from '@app/common/utils/id.js';
import {Pagination} from '@app/common/utils/pagination.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {StoreApplicationFileUploadUrlDto, StoreApplicationFileUploadUrlResultDto} from '@app/contracts/store/dto/store-application-file-upload-url.dto.js';
import type {StoreApplicationFileDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import type {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import type {StoreMyApplicationListDto, StoreMyApplicationListResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import type {StoreMyApplicationFileResultDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import type {StorageGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
import type {StoreRepositoryInterface} from './interfaces/store.repository.interface.js';
import {
    STORE_APPLICATION_NOT_FOUND_MESSAGE,
    STORE_APPLICATION_NOT_WAITING_MESSAGE,
    STORE_APPLICATION_STATE,
    STORE_BUSINESS_NUMBER_TAKEN_MESSAGE,
    STORE_FILE_KEY_INVALID_MESSAGE,
    STORE_FILE_LIMIT,
    STORE_FILE_LIMIT_MESSAGE,
    STORE_FILE_NOT_FOUND_MESSAGE,
    STORE_FILE_NOT_UPLOADED_MESSAGE,
    STORE_FILE_PURPOSE_INVALID_MESSAGE,
} from './store.constants.js';
import {STORE_REPOSITORY} from './store.symbols.js';
import {buildApplicationFileKey, isApplicationFileKey, toMyApplicationDetail, toMyApplicationFile, toMyApplicationItem} from './store.util.js';

/**
 * store 비즈니스 로직 (이용자 입점 신청) — 신청 · 취소 · 업체 정보 파일 · 내 신청. 총관리자의 신청 관리 · 승인 · 반려는 admin-service store 다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 * 업체 총관리자 비밀번호는 해시로만 두고, 파일 본문은 presigned URL 로 저장소에 바로 올린다(게이트웨이 · 브로커를 거치지 않는다).
 */
@Injectable()
export class StoreService {
    /**
     * @param storeRepository store repository 포트
     * @param storageGateway 파일 저장소 포트 (Amazon S3 · CloudFront — 업로드 주소 · 존재 확인 · 삭제 · 열람 주소)
     */
    constructor(
        @Inject(STORE_REPOSITORY)
        private readonly storeRepository: StoreRepositoryInterface,
        @Inject(STORAGE_GATEWAY)
        private readonly storageGateway: StorageGatewayInterface,
    ) {}

    /**
     * 입점 신청 — 업체 정보 · 업체 총관리자 아이디 · 비밀번호(해시로만 저장)를 등록하고, 업체 정보 파일은 신청 뒤 따로 붙인다. (RabbitMQ: user.store.application)
     * - 대기 중 신청이 있으면 400 (한 번에 1건)
     * - 같은 사업자번호의 대기 신청 · 등록 업체가 있으면 400 (validation_errors.business_number)
     *
     * @param user_id 신청한 이용자 ID
     * @param dto 업체 정보
     * @returns 입점 신청 ID
     */
    @Transactional()
    async apply(user_id: string, dto: StoreApplicationDto): Promise<StoreApplicationResultDto> {
        // 1. 대기 중 신청은 1건만
        const waiting = await this.storeRepository.countApplications({user_id, store_application_state_id: STORE_APPLICATION_STATE.WAIT});
        if (waiting > 0) {
            throw new BadRequestException({message: '이미 대기 중인 입점 신청이 있습니다.'});
        }

        // 2. 같은 사업자번호 — 대기 신청 · 등록 업체
        const sameApplications = await this.storeRepository.countApplications({business_number: dto.business_number, store_application_state_id: STORE_APPLICATION_STATE.WAIT});
        const sameStores = await this.storeRepository.countStores({business_number: dto.business_number});
        if (sameApplications + sameStores > 0) {
            throw new BadRequestException({message: STORE_BUSINESS_NUMBER_TAKEN_MESSAGE, validation_errors: createValidationError('business_number', STORE_BUSINESS_NUMBER_TAKEN_MESSAGE)});
        }

        // 3. 신청 등록 (대기) — 업체 총관리자 비밀번호는 해시로만 둔다
        const application = new StoreApplicationEntity();
        application.store_application_id = generateId();
        application.user_id = user_id;
        application.store_application_state_id = STORE_APPLICATION_STATE.WAIT;
        application.store_id = null;
        application.store_name = dto.store_name;
        application.business_number = dto.business_number;
        application.owner_name = dto.owner_name;
        application.phone = dto.phone;
        application.address = dto.address;
        application.address_detail = dto.address_detail ?? null;
        application.latitude = Number(dto.latitude);
        application.longitude = Number(dto.longitude);
        application.owner_phone = dto.owner_phone;
        application.head_manager_login_id = dto.head_manager_login_id;
        application.head_manager_login_pw = await getBcrypt(dto.head_manager_login_pw);
        application.application_comment = dto.application_comment ?? null;
        application.reject_comment = null;
        application.reviewed_at = null;
        application.is_deleted = 0;
        await this.storeRepository.insertApplication(application);
        return {store_application_id: application.store_application_id};
    }

    /**
     * 내 입점 신청 목록 — 대기 · 반려 · 승인 모두, 승인 신청은 업체코드(매니저 로그인 · 매니저 화면 주소) 포함. (내부 HTTP: GET /internal/v1/user-service/store/application/mine)
     *
     * @param user_id 로그인 이용자 ID
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getMyApplicationList(user_id: string, dto: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {
        const where: FindOptionsWhere<StoreApplicationEntity> = {user_id};
        const total_count = await this.storeRepository.countApplications(where);
        const pagination = new Pagination({...dto, total_count});
        const applications = await this.storeRepository.findApplicationList(where, pagination.limit, pagination.offset);
        const storeIds = applications.flatMap((application) => (application.store_id ? [application.store_id] : []));
        const stores = storeIds.length > 0 ? await this.storeRepository.findStores({store_id: In(storeIds)}) : [];
        const codes = new Map(stores.map((store) => [store.store_id, store.store_code]));
        return {
            list: applications.map((application) => toMyApplicationItem(application, application.store_id ? (codes.get(application.store_id) ?? null) : null)),
            pagination: pagination.getPagination(),
        };
    }

    /**
     * 내 입점 신청 상세 — 모든 상태, 업체 정보 파일 열람 주소 · 승인 신청은 업체코드 포함. 남의 신청은 404. (내부 HTTP: GET /internal/v1/user-service/store/application/mine/:store_application_id)
     *
     * @param user_id 로그인 이용자 ID
     * @param store_application_id 입점 신청 ID
     * @returns 신청 상세
     */
    async getMyApplication(user_id: string, store_application_id: string): Promise<StoreMyApplicationResultDto> {
        const application = await this.storeRepository.findApplication({store_application_id, user_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        const store = application.store_id ? await this.storeRepository.findStore({store_id: application.store_id}) : null;
        const rows = await this.storeRepository.findApplicationFileRows(store_application_id);
        const files: StoreMyApplicationFileResultDto[] = [];
        for (const row of rows) {
            const file_url = Number(row.is_private) === 1 ? (await this.storageGateway.createDownloadUrl(row.file_key)).download_url : this.storageGateway.getPublicUrl(row.file_key);
            files.push(toMyApplicationFile(row, file_url));
        }
        return toMyApplicationDetail(application, store?.store_code ?? null, files);
    }

    /**
     * 업체 정보 파일 업로드 주소 — 대기 중 내 신청 · 용도별 한도 안에서만. 키는 서버가 용도의 비공개 여부로 만든다. (내부 HTTP: POST /internal/v1/user-service/store/application/mine/:store_application_id/file/upload-url)
     *
     * @param user_id 로그인 이용자 ID
     * @param store_application_id 입점 신청 ID
     * @param dto 용도 · MIME 타입
     * @returns 저장 키 · 업로드 주소 · 만료 시각
     */
    async createMyApplicationFileUploadUrl(user_id: string, store_application_id: string, dto: StoreApplicationFileUploadUrlDto): Promise<StoreApplicationFileUploadUrlResultDto> {
        // 1. 대기 중 내 신청
        const application = await this.storeRepository.findApplication({store_application_id, user_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 2. 용도 (비공개 여부)
        const purpose = await this.storeRepository.findStoreFilePurpose(dto.store_file_purpose_id);
        if (!purpose) {
            throw new BadRequestException({message: STORE_FILE_PURPOSE_INVALID_MESSAGE});
        }

        // 3. 용도별 한도
        const count = await this.storeRepository.countStoreFiles({store_application_id, store_file_purpose_id: dto.store_file_purpose_id});
        if (count >= STORE_FILE_LIMIT[dto.store_file_purpose_id]) {
            throw new BadRequestException({message: STORE_FILE_LIMIT_MESSAGE});
        }

        // 4. 키 → 업로드 주소
        const file_key = buildApplicationFileKey(purpose.is_private, store_application_id, dto.content_type);
        const upload = await this.storageGateway.createUploadUrl({key: file_key, content_type: dto.content_type});
        return {file_key, upload_url: upload.upload_url, expires_at: upload.expires_at.toISOString()};
    }

    /**
     * 업체 정보 파일 등록 — 업로드 주소로 올린 파일의 키를 신청에 붙인다. (RabbitMQ: user.store.application-file)
     * - 대기 중 내 신청만, 키 모양(그 신청 · 용도의 비공개 여부 · 형식) · 용도별 한도 · 실제 업로드(exists) 확인
     *
     * @param user_id 로그인 이용자 ID
     * @param store_application_id 입점 신청 ID
     * @param dto 용도 · 키 · 파일명 · MIME 타입
     * @returns 업체 정보 파일 ID
     */
    @Transactional()
    async addMyApplicationFile(user_id: string, store_application_id: string, dto: StoreApplicationFileDto): Promise<StoreApplicationFileResultDto> {
        // 1. 대기 중 내 신청
        const application = await this.storeRepository.findApplication({store_application_id, user_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 2. 용도 (비공개 여부)
        const purpose = await this.storeRepository.findStoreFilePurpose(dto.store_file_purpose_id);
        if (!purpose) {
            throw new BadRequestException({message: STORE_FILE_PURPOSE_INVALID_MESSAGE});
        }

        // 3. 키 모양 — 그 신청 · 용도 · 형식으로 발급한 키만
        if (!isApplicationFileKey(dto.file_key, purpose.is_private, store_application_id, dto.content_type)) {
            throw new BadRequestException({message: STORE_FILE_KEY_INVALID_MESSAGE, validation_errors: createValidationError('file_key', STORE_FILE_KEY_INVALID_MESSAGE)});
        }

        // 4. 용도별 한도
        const count = await this.storeRepository.countStoreFiles({store_application_id, store_file_purpose_id: dto.store_file_purpose_id});
        if (count >= STORE_FILE_LIMIT[dto.store_file_purpose_id]) {
            throw new BadRequestException({message: STORE_FILE_LIMIT_MESSAGE});
        }

        // 5. 실제로 올라갔는지
        const uploaded = await this.storageGateway.exists(dto.file_key);
        if (!uploaded) {
            throw new BadRequestException({message: STORE_FILE_NOT_UPLOADED_MESSAGE});
        }

        // 6. 파일 등록 — 신청에 붙인다(업체는 승인 때). 정렬 순서 = 지금 개수
        const file = new StoreFileEntity();
        file.store_file_id = generateId();
        file.store_file_purpose_id = dto.store_file_purpose_id;
        file.store_application_id = store_application_id;
        file.store_id = null;
        file.file_key = dto.file_key;
        file.file_name = dto.file_name;
        file.content_type = dto.content_type;
        file.sort_order = count;
        file.is_deleted = 0;
        await this.storeRepository.insertStoreFile(file);
        return {store_file_id: file.store_file_id};
    }

    /**
     * 업체 정보 파일 삭제 — 대기 중 내 신청의 파일만. 행을 소프트 삭제(is_deleted = 1)한 뒤 저장소 파일을 실제로 지운다(마지막). (RabbitMQ: user.store.application-file-delete)
     *
     * @param user_id 로그인 이용자 ID
     * @param store_application_id 입점 신청 ID
     * @param store_file_id 업체 정보 파일 ID
     */
    @Transactional()
    async removeMyApplicationFile(user_id: string, store_application_id: string, store_file_id: string): Promise<void> {
        // 1. 대기 중 내 신청
        const application = await this.storeRepository.findApplication({store_application_id, user_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 2. 그 신청의 파일
        const file = await this.storeRepository.findStoreFile({store_file_id, store_application_id});
        if (!file) {
            throw new NotFoundException({message: STORE_FILE_NOT_FOUND_MESSAGE});
        }

        // 3. 행 소프트 삭제 → 저장소 파일 삭제(마지막)
        await this.storeRepository.deleteStoreFile({store_file_id});
        await this.storageGateway.remove(file.file_key);
    }

    /**
     * 입점 신청 취소 — 대기 중 내 신청만. 신청 · 업체 정보 파일 행을 소프트 삭제하고(is_deleted = 1 — 행은 남고 목록 · 상세에서 사라진다) 저장소 파일을 실제로 지운다(마지막). (RabbitMQ: user.store.application-cancel)
     * - 그 사이 승인 · 반려된 신청은 삭제가 0건이라 400 — 트랜잭션 전체가 롤백된다(승인된 업체의 파일은 store_id 가 있어 지워지지 않는다)
     *
     * @param user_id 로그인 이용자 ID
     * @param store_application_id 입점 신청 ID
     */
    @Transactional()
    async cancelMyApplication(user_id: string, store_application_id: string): Promise<void> {
        // 1. 대기 중 내 신청
        const application = await this.storeRepository.findApplication({store_application_id, user_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 2. 지울 저장소 파일 키
        const rows = await this.storeRepository.findApplicationFileRows(store_application_id);

        // 3. 파일 행 → 신청 행 소프트 삭제(is_deleted = 1). 대기 중일 때만
        await this.storeRepository.deleteApplicationFiles(store_application_id);
        const deleted = await this.storeRepository.deleteApplication({store_application_id, user_id, store_application_state_id: STORE_APPLICATION_STATE.WAIT});
        if (!deleted) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 4. 저장소 파일 삭제 (마지막)
        for (const row of rows) {
            await this.storageGateway.remove(row.file_key);
        }
    }
}
