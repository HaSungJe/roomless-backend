import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {In} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {generateId} from '@app/common/utils/id.js';
import {Pagination} from '@app/common/utils/pagination.js';
import {createValidationError} from '@app/common/utils/validation.js';
import {AUTH_ID, LOGIN_SCOPE} from '@app/contracts/roles.js';
import type {StoreApplicationApproveResultDto} from '@app/contracts/store/dto/store-application-approve.dto.js';
import type {StoreApplicationDetailFileResultDto, StoreApplicationDetailResultDto} from '@app/contracts/store/dto/store-application-detail.dto.js';
import type {StoreApplicationFileUploadUrlDto, StoreApplicationFileUploadUrlResultDto} from '@app/contracts/store/dto/store-application-file-upload-url.dto.js';
import type {StoreApplicationFileDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import type {StoreApplicationListDto, StoreApplicationListResultDto} from '@app/contracts/store/dto/store-application-list.dto.js';
import type {StoreApplicationRejectDto} from '@app/contracts/store/dto/store-application-reject.dto.js';
import type {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import type {StoreDetailFileResultDto, StoreDetailResultDto} from '@app/contracts/store/dto/store-detail.dto.js';
import type {StoreListDto, StoreListResultDto} from '@app/contracts/store/dto/store-list.dto.js';
import type {StoreMyApplicationListDto, StoreMyApplicationListResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import type {StoreMyApplicationFileResultDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import type {StoreStateDto} from '@app/contracts/store/dto/store-state.dto.js';
import type {StoreUpdateDto} from '@app/contracts/store/dto/store-update.dto.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {SMS_SENDER, STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import type {SmsSenderInterface, StorageGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
import type {StoreRepositoryInterface} from './interfaces/store.repository.interface.js';
import {
    STORE_APPLICATION_NOT_FOUND_MESSAGE,
    STORE_APPLICATION_NOT_WAITING_MESSAGE,
    STORE_APPLICATION_STATE,
    STORE_BUSINESS_NUMBER_TAKEN_MESSAGE,
    STORE_FILE_LIMIT,
    STORE_FILE_LIMIT_MESSAGE,
    STORE_FILE_PURPOSE,
    STORE_FILE_PURPOSE_INVALID_MESSAGE,
    STORE_LEAVE_BLOCK_COMMENT,
    STORE_LEAVE_LOCKED_MESSAGE,
    STORE_NOT_FOUND_MESSAGE,
    STORE_STATE,
} from './store.constants.js';
import {STORE_REPOSITORY} from './store.symbols.js';
import {
    buildApplicationFileKey,
    buildApplicationListWhere,
    buildStoreListWhere,
    isApplicationFileKey,
    storeApprovedText,
    toApplicant,
    toApplicationDetail,
    toApplicationDetailFile,
    toApplicationListItem,
    toMyApplicationDetail,
    toMyApplicationFile,
    toMyApplicationItem,
    toStoreDetail,
    toStoreDetailFile,
    toStoreListItem,
} from './store.util.js';

/**
 * store 도메인 비즈니스 로직 (헥사고날의 안쪽) — 입점 신청(이용자) · 신청 관리 · 업체 관리(총관리자).
 * 내부 HTTP 컨트롤러와 RabbitMQ 핸들러가 같은 메서드를 호출한다. public 메서드 1개 = API 1개.
 * 로그인 그룹(이용자 · 관리자)은 게이트웨이 가드가 가른다 — 이 service 는 actor 의 user_id 만 받는다.
 * 업체 정보 파일의 열람 주소는 용도의 is_private 로 고른다 — 1 이면 서명된 열람 주소, 0 이면 CDN 공개 주소.
 */
@Injectable()
export class StoreService {
    /**
     * @param storeRepository store repository 포트
     * @param storageGateway 파일 저장소 포트 (Amazon S3 · CloudFront 공개 주소)
     * @param smsSender SMS 발송 포트 (Amazon SNS)
     */
    constructor(
        @Inject(STORE_REPOSITORY)
        private readonly storeRepository: StoreRepositoryInterface,
        @Inject(STORAGE_GATEWAY)
        private readonly storageGateway: StorageGatewayInterface,
        @Inject(SMS_SENDER)
        private readonly smsSender: SmsSenderInterface,
    ) {}

    /**
     * 입점 신청 — 업체 정보 · 업체 총관리자 아이디 · 비밀번호(해시로만 저장)를 등록하고, 업체 정보 파일은 신청 뒤 따로 붙인다. (RabbitMQ: admin.store.application)
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
        await this.storeRepository.insertApplication(application);
        return {store_application_id: application.store_application_id};
    }

    /**
     * 내 입점 신청 목록 — 대기 · 반려 · 승인 모두, 승인 신청은 업체코드(매니저 로그인 · 매니저 화면 주소) 포함. (내부 HTTP: GET /internal/v1/admin-service/store/application/mine)
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
     * 내 입점 신청 상세 — 모든 상태, 업체 정보 파일 열람 주소 · 승인 신청은 업체코드 포함. 남의 신청은 404. (내부 HTTP: GET /internal/v1/admin-service/store/application/mine/:store_application_id)
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
     * 업체 정보 파일 업로드 주소 — 대기 중 내 신청 · 용도별 한도 안에서만. 키는 서버가 용도의 비공개 여부로 만든다. (내부 HTTP: POST /internal/v1/admin-service/store/application/mine/:store_application_id/file/upload-url)
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
     * 업체 정보 파일 등록 — 업로드 주소로 올린 파일의 키를 신청에 붙인다. (RabbitMQ: admin.store.application-file)
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
            throw new BadRequestException({message: '업로드 주소로 받은 저장 키가 아닙니다.', validation_errors: createValidationError('file_key', '업로드 주소로 받은 저장 키가 아닙니다.')});
        }

        // 4. 용도별 한도
        const count = await this.storeRepository.countStoreFiles({store_application_id, store_file_purpose_id: dto.store_file_purpose_id});
        if (count >= STORE_FILE_LIMIT[dto.store_file_purpose_id]) {
            throw new BadRequestException({message: STORE_FILE_LIMIT_MESSAGE});
        }

        // 5. 실제로 올라갔는지
        const uploaded = await this.storageGateway.exists(dto.file_key);
        if (!uploaded) {
            throw new BadRequestException({message: '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.'});
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
        await this.storeRepository.insertStoreFile(file);
        return {store_file_id: file.store_file_id};
    }

    /**
     * 업체 정보 파일 삭제 — 대기 중 내 신청의 파일만. 행을 지운 뒤 저장소 파일을 지운다(마지막). (RabbitMQ: admin.store.application-file-delete)
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
            throw new NotFoundException({message: '파일을 찾을 수 없습니다.'});
        }

        // 3. 행 삭제 → 저장소 파일 삭제(마지막)
        await this.storeRepository.deleteStoreFile({store_file_id});
        await this.storageGateway.remove(file.file_key);
    }

    /**
     * 입점 신청 취소 — 대기 중 내 신청만. 신청 · 업체 정보 파일 행을 지우고(목록 · 상세에서 사라진다) 저장소 파일을 지운다(마지막). (RabbitMQ: admin.store.application-cancel)
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

        // 3. 파일 행 → 신청 행 (파일 FK 가 RESTRICT 라 파일 먼저). 대기 중일 때만 지운다
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

    /**
     * 입점 신청 목록 (총관리자) — 상태 · 검색어. (내부 HTTP: GET /internal/v1/admin-service/store/application)
     *
     * @param dto 페이지 · 상태 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getApplicationList(dto: StoreApplicationListDto): Promise<StoreApplicationListResultDto> {
        const where = buildApplicationListWhere(dto);
        const total_count = await this.storeRepository.countApplications(where);
        const pagination = new Pagination({...dto, total_count});
        const applications = await this.storeRepository.findApplicationList(where, pagination.limit, pagination.offset);
        return {list: applications.map(toApplicationListItem), pagination: pagination.getPagination()};
    }

    /**
     * 입점 신청 상세 (총관리자) — 신청자 · 업체 정보 파일 열람 주소 · 업체코드(승인 신청) 포함. (내부 HTTP: GET /internal/v1/admin-service/store/application/:store_application_id)
     *
     * @param store_application_id 입점 신청 ID
     * @returns 신청 상세
     */
    async getApplication(store_application_id: string): Promise<StoreApplicationDetailResultDto> {
        const application = await this.storeRepository.findApplication({store_application_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        const store = application.store_id ? await this.storeRepository.findStore({store_id: application.store_id}) : null;
        const applicant = await this.storeRepository.findApplicant(application.user_id);
        const rows = await this.storeRepository.findApplicationFileRows(store_application_id);
        const files: StoreApplicationDetailFileResultDto[] = [];
        for (const row of rows) {
            const file_url = Number(row.is_private) === 1 ? (await this.storageGateway.createDownloadUrl(row.file_key)).download_url : this.storageGateway.getPublicUrl(row.file_key);
            files.push(toApplicationDetailFile(row, file_url));
        }
        return toApplicationDetail(application, store?.store_code ?? null, toApplicant(applicant), files);
    }

    /**
     * 입점 승인 (총관리자) — 업체 등록(활성 · 영업준비 · 업체코드) + 신청의 업체 정보 파일을 업체로 + 업체 총관리자(= 대표자) 계정(신청 때 정한 아이디 · 비밀번호) + 승인 알림 SMS(대표자 번호, 마지막). (RabbitMQ: admin.store.application-approve)
     * - 대기 중 신청만, 사업자등록증 1장 필수, 신청자 계정이 있어야 한다(성별 · 생년월일 복사)
     * - 사업자번호 UK 충돌은 repository 가 400 — 트랜잭션 전체가 롤백된다. 매니저 아이디 · 휴대폰 번호는 업체 단위라 새 업체에서 겹치지 않는다
     * - 신청 상태는 대기 조건으로 바꾼다 — 그 사이 취소 · 반려됐으면 0건이라 400(롤백, SMS 없음)
     *
     * @param store_application_id 입점 신청 ID
     * @returns 등록한 업체 ID · 업체코드
     */
    @Transactional()
    async approveApplication(store_application_id: string): Promise<StoreApplicationApproveResultDto> {
        // 1. 대기 중 신청
        const application = await this.storeRepository.findApplication({store_application_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 2. 사업자등록증 1장 필수
        const licenses = await this.storeRepository.countStoreFiles({store_application_id, store_file_purpose_id: STORE_FILE_PURPOSE.BUSINESS_LICENSE});
        if (licenses === 0) {
            throw new BadRequestException({message: '사업자등록증 사진이 없어 승인할 수 없습니다.'});
        }

        // 3. 신청자 (성별 · 생년월일 복사)
        const applicant = await this.storeRepository.findApplicant(application.user_id);
        if (!applicant) {
            throw new BadRequestException({message: '신청자 정보를 찾을 수 없어 승인할 수 없습니다.'});
        }

        // 4. 업체 등록 — 활성 + 영업준비(is_open = 0) + 업체코드(매니저 로그인 · 매니저 화면 주소)
        const store_id = generateId();
        const store_code = generateId();
        const store = new StoreEntity();
        store.store_id = store_id;
        store.store_code = store_code;
        store.store_state_id = STORE_STATE.ACTIVE;
        store.store_name = application.store_name;
        store.business_number = application.business_number;
        store.owner_name = application.owner_name;
        store.phone = application.phone;
        store.address = application.address;
        store.address_detail = application.address_detail ?? null;
        store.latitude = application.latitude;
        store.longitude = application.longitude;
        store.introduction = null;
        store.store_detail = {};
        store.is_always_open = 0;
        store.is_open = 0;
        store.maintenance_minutes = 0;
        store.is_deleted = 0;
        store.delete_backup = null;
        await this.storeRepository.insertStore(store);

        // 5. 신청의 업체 정보 파일을 업체로 (같은 행에 store_id — 파일을 옮기지 않는다)
        await this.storeRepository.assignStoreFiles(store_application_id, store_id);

        // 6. 업체 총관리자 계정(= 대표자) — 신청 때 정한 아이디 · 비밀번호(이미 해시), 이름 · 닉네임 대표자명, 휴대폰 대표자 번호
        const manager = new UserEntity();
        manager.user_id = generateId();
        manager.user_search_code = generateId();
        manager.auth_id = AUTH_ID.HEAD_MANAGER;
        manager.login_scope = LOGIN_SCOPE.MANAGER;
        manager.state_id = 'ACTIVE';
        manager.sns_id = null;
        manager.sns_user_id = null;
        manager.store_id = store_id;
        manager.login_id = application.head_manager_login_id;
        manager.login_pw = application.head_manager_login_pw;
        manager.name = application.owner_name;
        manager.gender = applicant.gender;
        manager.birth = applicant.birth;
        manager.phone = application.owner_phone;
        manager.phone_verified_at = null;
        manager.nickname = application.owner_name;
        manager.device_os = null;
        manager.device_token = null;
        manager.is_password_change_required = 0;
        manager.block_comment = null;
        manager.leave_comment = null;
        manager.leave_reserved_at = null;
        manager.leave_previous_state_id = null;
        manager.leave_backup = null;
        await this.storeRepository.insertHeadManager(manager);

        // 7. 신청 승인 — 그 사이 취소 · 반려된 신청이면 0건이라 400 (위 쓰기가 모두 롤백된다)
        const approved = new StoreApplicationEntity();
        approved.store_application_state_id = STORE_APPLICATION_STATE.APPROVED;
        approved.store_id = store_id;
        approved.reviewed_at = new Date();
        const updated = await this.storeRepository.updateApplication({store_application_id, store_application_state_id: STORE_APPLICATION_STATE.WAIT}, approved);
        if (!updated) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 8. 승인 알림 SMS (마지막 — 실패 503 이면 위 쓰기가 모두 롤백되고 재시도된다)
        await this.smsSender.send({to: application.owner_phone, text: storeApprovedText(application.store_name)});
        return {store_id, store_code};
    }

    /**
     * 입점 반려 (총관리자) — 대기 중 신청만, 사유를 남긴다. 업체 정보 파일은 남긴다(신청자가 사유와 함께 본다). (RabbitMQ: admin.store.application-reject)
     * - 그 사이 취소 · 승인된 신청이면 수정이 0건이라 400
     *
     * @param store_application_id 입점 신청 ID
     * @param dto 반려 사유
     */
    @Transactional()
    async rejectApplication(store_application_id: string, dto: StoreApplicationRejectDto): Promise<void> {
        const application = await this.storeRepository.findApplication({store_application_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }
        const rejected = new StoreApplicationEntity();
        rejected.store_application_state_id = STORE_APPLICATION_STATE.REJECTED;
        rejected.reject_comment = dto.reject_comment;
        rejected.reviewed_at = new Date();
        const updated = await this.storeRepository.updateApplication({store_application_id, store_application_state_id: STORE_APPLICATION_STATE.WAIT}, rejected);
        if (!updated) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }
    }

    /**
     * 업체 목록 (총관리자) — 상태 · 검색어. (내부 HTTP: GET /internal/v1/admin-service/store)
     *
     * @param dto 페이지 · 상태 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getStoreList(dto: StoreListDto): Promise<StoreListResultDto> {
        const where = buildStoreListWhere(dto);
        const total_count = await this.storeRepository.countStores(where);
        const pagination = new Pagination({...dto, total_count});
        const stores = await this.storeRepository.findStoreList(where, pagination.limit, pagination.offset);
        return {list: stores.map(toStoreListItem), pagination: pagination.getPagination()};
    }

    /**
     * 업체 상세 (총관리자) — 업체 정보 파일 열람 주소 포함. (내부 HTTP: GET /internal/v1/admin-service/store/:store_id)
     *
     * @param store_id 업체 ID
     * @returns 업체 상세
     */
    async getStore(store_id: string): Promise<StoreDetailResultDto> {
        const store = await this.storeRepository.findStore({store_id});
        if (!store) {
            throw new NotFoundException({message: STORE_NOT_FOUND_MESSAGE});
        }
        const rows = await this.storeRepository.findStoreFileRows(store_id);
        const files: StoreDetailFileResultDto[] = [];
        for (const row of rows) {
            const file_url = Number(row.is_private) === 1 ? (await this.storageGateway.createDownloadUrl(row.file_key)).download_url : this.storageGateway.getPublicUrl(row.file_key);
            files.push(toStoreDetailFile(row, file_url));
        }
        return toStoreDetail(store, files);
    }

    /**
     * 업체 정보 수정 (총관리자) — 사업자번호는 바꾸지 않는다. 탈퇴 업체는 400. (RabbitMQ: admin.store.update)
     *
     * @param store_id 업체 ID
     * @param dto 상호명 · 대표자명 · 연락처 · 주소 · 상세주소 · 위경도
     */
    @Transactional()
    async updateStore(store_id: string, dto: StoreUpdateDto): Promise<void> {
        const store = await this.storeRepository.findStore({store_id});
        if (!store) {
            throw new NotFoundException({message: STORE_NOT_FOUND_MESSAGE});
        }
        if (store.store_state_id === STORE_STATE.LEAVE) {
            throw new BadRequestException({message: STORE_LEAVE_LOCKED_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.store_name = dto.store_name;
        storeEntity.owner_name = dto.owner_name;
        storeEntity.phone = dto.phone;
        storeEntity.address = dto.address;
        storeEntity.address_detail = dto.address_detail ?? null;
        storeEntity.latitude = Number(dto.latitude);
        storeEntity.longitude = Number(dto.longitude);
        await this.storeRepository.updateStore({store_id}, storeEntity);
    }

    /**
     * 업체 상태 변경 (총관리자) — 활성 · 영업중지 · 탈퇴. 같은 상태 · 탈퇴 업체는 400. (RabbitMQ: admin.store.state)
     * 탈퇴로 바꾸면 그 업체 매니저 계정을 정지(BLOCK)하고, 사업자번호를 DELETE_<store_id> 로 마스킹(원래 값은 delete_backup)해 같은 번호로 다시 입점 신청할 수 있게 한다.
     * 영업중지는 매니저 계정을 그대로 둔다.
     *
     * @param store_id 업체 ID
     * @param dto 바꿀 상태
     */
    @Transactional()
    async changeStoreState(store_id: string, dto: StoreStateDto): Promise<void> {
        // 1. 업체 · 바꿀 수 있는 상태인지
        const store = await this.storeRepository.findStore({store_id});
        if (!store) {
            throw new NotFoundException({message: STORE_NOT_FOUND_MESSAGE});
        }
        if (store.store_state_id === STORE_STATE.LEAVE) {
            throw new BadRequestException({message: STORE_LEAVE_LOCKED_MESSAGE});
        }
        if (store.store_state_id === dto.store_state_id) {
            throw new BadRequestException({message: '이미 같은 상태입니다.'});
        }

        // 2. 탈퇴 — 매니저 정지 · 사업자번호 마스킹
        const storeEntity = new StoreEntity();
        storeEntity.store_state_id = dto.store_state_id;
        if (dto.store_state_id === STORE_STATE.LEAVE) {
            await this.storeRepository.updateStoreManagers(store_id, 'BLOCK', STORE_LEAVE_BLOCK_COMMENT);
            storeEntity.business_number = `DELETE_${store_id}`;
            storeEntity.delete_backup = JSON.stringify({business_number: store.business_number});
        }

        // 3. 업체 상태
        await this.storeRepository.updateStore({store_id}, storeEntity);
    }
}
