import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {In, MoreThan} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
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
import type {StoreMineBreaksDto} from '@app/contracts/store/dto/store-mine-breaks.dto.js';
import type {StoreMineFileOrderDto} from '@app/contracts/store/dto/store-mine-file-order.dto.js';
import type {StoreMineFileUploadUrlDto, StoreMineFileUploadUrlResultDto} from '@app/contracts/store/dto/store-mine-file-upload-url.dto.js';
import type {StoreMineFileDto, StoreMineFileResultDto} from '@app/contracts/store/dto/store-mine-file.dto.js';
import type {StoreMineHoursDto} from '@app/contracts/store/dto/store-mine-hours.dto.js';
import type {StoreMineMaintenanceDto} from '@app/contracts/store/dto/store-mine-maintenance.dto.js';
import type {StoreMineOpenDto} from '@app/contracts/store/dto/store-mine-open.dto.js';
import type {StoreMineProfileDto} from '@app/contracts/store/dto/store-mine-profile.dto.js';
import type {StoreMineReservationPolicyDto} from '@app/contracts/store/dto/store-mine-reservation-policy.dto.js';
import type {StoreMineUnavailablePeriodListDto, StoreMineUnavailablePeriodListResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period-list.dto.js';
import type {StoreMineUnavailablePeriodDto, StoreMineUnavailablePeriodResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period.dto.js';
import type {StoreMineFileItemResultDto, StoreMineResultDto} from '@app/contracts/store/dto/store-mine.dto.js';
import type {StoreMyApplicationListDto, StoreMyApplicationListResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import type {StoreMyApplicationFileResultDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import type {StoreOpenDto} from '@app/contracts/store/dto/store-open.dto.js';
import type {StoreStateDto} from '@app/contracts/store/dto/store-state.dto.js';
import type {StoreUpdateDto} from '@app/contracts/store/dto/store-update.dto.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {SMS_SENDER, STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import type {SmsSenderInterface, StorageGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
import type {StoreRepositoryInterface} from './interfaces/store.repository.interface.js';
import {
    STORE_APPLICATION_NOT_FOUND_MESSAGE,
    STORE_APPLICATION_NOT_WAITING_MESSAGE,
    STORE_APPLICATION_STATE,
    STORE_BOOKING_OPEN_HOURS_DEFAULT,
    STORE_BUSINESS_NUMBER_TAKEN_MESSAGE,
    STORE_DATETIME_FORMAT,
    STORE_FILE_KEY_INVALID_MESSAGE,
    STORE_FILE_LIMIT,
    STORE_FILE_LIMIT_MESSAGE,
    STORE_FILE_NOT_FOUND_MESSAGE,
    STORE_FILE_NOT_UPLOADED_MESSAGE,
    STORE_FILE_PURPOSE,
    STORE_FILE_PURPOSE_INVALID_MESSAGE,
    STORE_LEAVE_BLOCK_COMMENT,
    STORE_LEAVE_LOCKED_MESSAGE,
    STORE_MANAGER_STORE_NOT_FOUND_MESSAGE,
    STORE_NOT_FOUND_MESSAGE,
    STORE_PLAN_DAYS_OF_WEEK_ALL,
    STORE_PLAN_DEFAULTS,
    STORE_REFUND_DEADLINE_HOURS_DEFAULT,
    STORE_SAME_STATE_MESSAGE,
    STORE_STATE,
} from './store.constants.js';
import {STORE_REPOSITORY} from './store.symbols.js';
import {
    buildApplicationFileKey,
    buildApplicationListWhere,
    buildStoreFileKey,
    buildStoreListWhere,
    buildUnavailablePeriodOverlapWhere,
    filterStoreImages,
    hasEveryDayOnce,
    hasOverlappingBreaks,
    isApplicationFileKey,
    isSameIdSet,
    isSameTimeOfDay,
    isStoreFileKey,
    nextSortOrder,
    storeApprovedText,
    toApplicant,
    toApplicationDetail,
    toApplicationDetailFile,
    toApplicationListItem,
    toMineBreakItem,
    toMineDetail,
    toMineFileItem,
    toMineHourItem,
    toMyApplicationDetail,
    toMyApplicationFile,
    toMyApplicationItem,
    toStoreDetail,
    toStoreDetailFile,
    toStoreListItem,
    toUnavailablePeriodItem,
} from './store.util.js';

/**
 * store 도메인 비즈니스 로직 (헥사고날의 안쪽) — 입점 신청(이용자) · 신청 관리 · 업체 관리(총관리자) · 내 업체 설정(업체 관리자).
 * 내부 HTTP 컨트롤러와 RabbitMQ 핸들러가 같은 메서드를 호출한다. public 메서드 1개 = API 1개.
 * 로그인 그룹(이용자 · 매니저 · 관리자)은 게이트웨이 가드가 가른다 — 이 service 는 actor 의 user_id 만 받는다.
 * 내 업체 설정은 actor 로 소속 업체를 찾고(findStoreByManager), 쓰기는 업체 행을 잠가 같은 업체의 설정 쓰기를 한 번에 하나로 한다.
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
        application.is_deleted = 0;
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
     * 업체 정보 파일 삭제 — 대기 중 내 신청의 파일만. 행을 소프트 삭제(is_deleted = 1)한 뒤 저장소 파일을 실제로 지운다(마지막). (RabbitMQ: admin.store.application-file-delete)
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
     * 입점 신청 취소 — 대기 중 내 신청만. 신청 · 업체 정보 파일 행을 소프트 삭제하고(is_deleted = 1 — 행은 남고 목록 · 상세에서 사라진다) 저장소 파일을 실제로 지운다(마지막). (RabbitMQ: admin.store.application-cancel)
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
        store.is_always_open = 0;
        store.is_open = 0;
        store.maintenance_minutes = 0;
        store.booking_open_hours = STORE_BOOKING_OPEN_HOURS_DEFAULT;
        store.refund_deadline_hours = STORE_REFUND_DEADLINE_HOURS_DEFAULT;
        store.suspend_comment = null;
        store.is_deleted = 0;
        store.delete_backup = null;
        await this.storeRepository.insertStore(store);

        // 5. 업체 상품 설정 — 상품 종류마다 1행(판매 · 매일 · 기본 이용 시간 · 입실 · 퇴실 시각)
        const plans = STORE_PLAN_DEFAULTS.map((defaults) => {
            const plan = new RoomPlanEntity();
            plan.room_plan_id = generateId();
            plan.store_id = store_id;
            plan.room_plan_type_id = defaults.room_plan_type_id;
            plan.is_used = 1;
            plan.days_of_week = STORE_PLAN_DAYS_OF_WEEK_ALL;
            plan.usage_hours = defaults.usage_hours;
            plan.check_in_time = defaults.check_in_time;
            plan.check_out_time = defaults.check_out_time;
            return plan;
        });
        await this.storeRepository.insertStorePlans(plans);

        // 6. 신청의 업체 정보 파일을 업체로 (같은 행에 store_id — 파일을 옮기지 않는다)
        await this.storeRepository.assignStoreFiles(store_application_id, store_id);

        // 7. 업체 총관리자 계정(= 대표자) — 신청 때 정한 아이디 · 비밀번호(이미 해시), 이름 · 닉네임 대표자명, 휴대폰 대표자 번호
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

        // 8. 신청 승인 — 그 사이 취소 · 반려된 신청이면 0건이라 400 (위 쓰기가 모두 롤백된다)
        const approved = new StoreApplicationEntity();
        approved.store_application_state_id = STORE_APPLICATION_STATE.APPROVED;
        approved.store_id = store_id;
        approved.reviewed_at = new Date();
        const updated = await this.storeRepository.updateApplication({store_application_id, store_application_state_id: STORE_APPLICATION_STATE.WAIT}, approved);
        if (!updated) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 9. 승인 알림 SMS (마지막 — 실패 503 이면 위 쓰기가 모두 롤백되고 재시도된다)
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
     * 영업중지는 매니저 계정을 그대로 두고 정지 사유를 남긴다(선택). 활성 · 탈퇴로 바꾸면 정지 사유를 비운다.
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
            throw new BadRequestException({message: STORE_SAME_STATE_MESSAGE});
        }

        // 2. 상태 · 정지 사유 — 영업중지일 때만 사유가 남는다
        const storeEntity = new StoreEntity();
        storeEntity.store_state_id = dto.store_state_id;
        storeEntity.suspend_comment = dto.store_state_id === STORE_STATE.SUSPEND ? (dto.suspend_comment ?? null) : null;

        // 3. 탈퇴 — 매니저 정지 · 사업자번호 마스킹
        if (dto.store_state_id === STORE_STATE.LEAVE) {
            await this.storeRepository.updateStoreManagers(store_id, 'BLOCK', STORE_LEAVE_BLOCK_COMMENT);
            storeEntity.business_number = `DELETE_${store_id}`;
            storeEntity.delete_backup = JSON.stringify({business_number: store.business_number});
        }

        // 4. 업체 상태
        await this.storeRepository.updateStore({store_id}, storeEntity);
    }

    /**
     * 업체 영업중 여부 변경 (총관리자 · 관리자) — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님. 탈퇴 업체 · 같은 값은 400. (RabbitMQ: admin.store.open)
     *
     * @param store_id 업체 ID
     * @param dto 영업중 여부
     */
    @Transactional()
    async changeStoreOpen(store_id: string, dto: StoreOpenDto): Promise<void> {
        const store = await this.storeRepository.findStore({store_id});
        if (!store) {
            throw new NotFoundException({message: STORE_NOT_FOUND_MESSAGE});
        }
        if (store.store_state_id === STORE_STATE.LEAVE) {
            throw new BadRequestException({message: STORE_LEAVE_LOCKED_MESSAGE});
        }
        if (store.is_open === dto.is_open) {
            throw new BadRequestException({message: STORE_SAME_STATE_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.is_open = dto.is_open;
        await this.storeRepository.updateStore({store_id}, storeEntity);
    }

    /**
     * 내 업체 상세 (업체 관리자) — 업체 정보 · 업체코드 · 영업 설정 · 요일별 영업시간 · 브레이크타임 · 업체 정보 파일 열람 주소. (내부 HTTP: GET /internal/v1/admin-service/store/mine)
     *
     * @param user_id 로그인 매니저 ID
     * @returns 내 업체 상세
     */
    async getMyStore(user_id: string): Promise<StoreMineResultDto> {
        const store = await this.storeRepository.findStoreByManager(user_id, false);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const hours = await this.storeRepository.findStoreHours(store.store_id);
        const breaks = await this.storeRepository.findStoreBreaks(store.store_id);
        const rows = await this.storeRepository.findStoreFileRows(store.store_id);
        const files: StoreMineFileItemResultDto[] = [];
        for (const row of rows) {
            const file_url = Number(row.is_private) === 1 ? (await this.storageGateway.createDownloadUrl(row.file_key)).download_url : this.storageGateway.getPublicUrl(row.file_key);
            files.push(toMineFileItem(row, file_url));
        }
        return toMineDetail(store, hours.map(toMineHourItem), breaks.map(toMineBreakItem), files);
    }

    /**
     * 내 업체 소개 수정 (업체 관리자) — 소개 · 연락처. (RabbitMQ: admin.store.mine-profile)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 소개 · 연락처
     */
    @Transactional()
    async updateMyStoreProfile(user_id: string, dto: StoreMineProfileDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.introduction = dto.introduction ?? null;
        storeEntity.phone = dto.phone;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }

    /**
     * 내 업체 사진 업로드 주소 (업체 관리자) — 업체 사진 한도(승인 때 넘어온 사진 포함) 안에서만. 키는 서버가 용도의 비공개 여부로 만든다. (내부 HTTP: POST /internal/v1/admin-service/store/mine/file/upload-url)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto MIME 타입
     * @returns 저장 키 · 업로드 주소 · 만료 시각
     */
    async createMyStoreFileUploadUrl(user_id: string, dto: StoreMineFileUploadUrlDto): Promise<StoreMineFileUploadUrlResultDto> {
        // 1. 내 업체
        const store = await this.storeRepository.findStoreByManager(user_id, false);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 업체 사진 용도 (비공개 여부)
        const purpose = await this.storeRepository.findStoreFilePurpose(STORE_FILE_PURPOSE.STORE_IMAGE);
        if (!purpose) {
            throw new BadRequestException({message: STORE_FILE_PURPOSE_INVALID_MESSAGE});
        }

        // 3. 한도
        const count = await this.storeRepository.countStoreFiles({store_id: store.store_id, store_file_purpose_id: STORE_FILE_PURPOSE.STORE_IMAGE});
        if (count >= STORE_FILE_LIMIT[STORE_FILE_PURPOSE.STORE_IMAGE]) {
            throw new BadRequestException({message: STORE_FILE_LIMIT_MESSAGE});
        }

        // 4. 키 → 업로드 주소
        const file_key = buildStoreFileKey(purpose.is_private, store.store_id, dto.content_type);
        const upload = await this.storageGateway.createUploadUrl({key: file_key, content_type: dto.content_type});
        return {file_key, upload_url: upload.upload_url, expires_at: upload.expires_at.toISOString()};
    }

    /**
     * 내 업체 사진 등록 (업체 관리자) — 업로드 주소로 올린 사진의 키를 업체에 붙인다(신청 없음). (RabbitMQ: admin.store.mine-file)
     * - 키 모양(그 업체 · 용도의 비공개 여부 · 형식) · 한도 · 실제 업로드(exists) 확인
     * - 정렬 순서는 지금 사진의 가장 큰 순서 + 1 — 삭제로 빈 번호가 있어도 마지막에 붙는다
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 키 · 파일명 · MIME 타입
     * @returns 업체 정보 파일 ID
     */
    @Transactional()
    async addMyStoreFile(user_id: string, dto: StoreMineFileDto): Promise<StoreMineFileResultDto> {
        // 1. 내 업체 (잠금 — 한도 확인 · 등록을 한 번에 하나)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 업체 사진 용도 (비공개 여부)
        const purpose = await this.storeRepository.findStoreFilePurpose(STORE_FILE_PURPOSE.STORE_IMAGE);
        if (!purpose) {
            throw new BadRequestException({message: STORE_FILE_PURPOSE_INVALID_MESSAGE});
        }

        // 3. 키 모양 — 그 업체 · 용도 · 형식으로 발급한 키만
        if (!isStoreFileKey(dto.file_key, purpose.is_private, store.store_id, dto.content_type)) {
            throw new BadRequestException({message: STORE_FILE_KEY_INVALID_MESSAGE, validation_errors: createValidationError('file_key', STORE_FILE_KEY_INVALID_MESSAGE)});
        }

        // 4. 한도
        const images = filterStoreImages(await this.storeRepository.findStoreFileRows(store.store_id));
        if (images.length >= STORE_FILE_LIMIT[STORE_FILE_PURPOSE.STORE_IMAGE]) {
            throw new BadRequestException({message: STORE_FILE_LIMIT_MESSAGE});
        }

        // 5. 실제로 올라갔는지
        const uploaded = await this.storageGateway.exists(dto.file_key);
        if (!uploaded) {
            throw new BadRequestException({message: STORE_FILE_NOT_UPLOADED_MESSAGE});
        }

        // 6. 사진 등록 — 업체에만 붙는다, 마지막 순서
        const file = new StoreFileEntity();
        file.store_file_id = generateId();
        file.store_file_purpose_id = STORE_FILE_PURPOSE.STORE_IMAGE;
        file.store_application_id = null;
        file.store_id = store.store_id;
        file.file_key = dto.file_key;
        file.file_name = dto.file_name;
        file.content_type = dto.content_type;
        file.sort_order = nextSortOrder(images);
        file.is_deleted = 0;
        await this.storeRepository.insertStoreFile(file);
        return {store_file_id: file.store_file_id};
    }

    /**
     * 내 업체 사진 삭제 (업체 관리자) — 그 업체의 업체 사진만(사업자등록증은 지울 수 없어 없는 파일과 같은 404). 행을 소프트 삭제(is_deleted = 1)한 뒤 저장소 파일을 실제로 지운다(마지막). 남은 사진의 순서 번호는 그대로. (RabbitMQ: admin.store.mine-file-delete)
     *
     * @param user_id 로그인 매니저 ID
     * @param store_file_id 업체 정보 파일 ID
     */
    @Transactional()
    async removeMyStoreFile(user_id: string, store_file_id: string): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 업체 사진
        const file = await this.storeRepository.findStoreFile({store_file_id, store_id: store.store_id, store_file_purpose_id: STORE_FILE_PURPOSE.STORE_IMAGE});
        if (!file) {
            throw new NotFoundException({message: STORE_FILE_NOT_FOUND_MESSAGE});
        }

        // 3. 행 소프트 삭제 → 저장소 파일 삭제(마지막)
        await this.storeRepository.deleteStoreFile({store_file_id});
        await this.storageGateway.remove(file.file_key);
    }

    /**
     * 내 업체 사진 순서 변경 (업체 관리자) — 지금 업체 사진 ID 전부를 원하는 순서로 받아 0 부터 다시 매긴다(가장 앞이 대표). (RabbitMQ: admin.store.mine-file-order)
     * - 빠지거나 남거나 겹치면 400 (validation_errors.store_file_ids)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 업체 사진 ID 순서
     */
    @Transactional()
    async reorderMyStoreFiles(user_id: string, dto: StoreMineFileOrderDto): Promise<void> {
        // 1. 내 업체 (잠금 — 등록 · 삭제와 엇갈리지 않게)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 지금 업체 사진 전부를 한 번씩
        const images = filterStoreImages(await this.storeRepository.findStoreFileRows(store.store_id));
        if (
            !isSameIdSet(
                dto.store_file_ids,
                images.map((row) => row.store_file_id),
            )
        ) {
            throw new BadRequestException({
                message: '업체 사진 전체를 한 번씩 원하는 순서로 보내주세요.',
                validation_errors: createValidationError('store_file_ids', '업체 사진 전체를 한 번씩 원하는 순서로 보내주세요.'),
            });
        }

        // 3. 받은 순서대로 0 부터
        for (const [index, store_file_id] of dto.store_file_ids.entries()) {
            const file = new StoreFileEntity();
            file.sort_order = index;
            await this.storeRepository.updateStoreFile({store_file_id}, file);
        }
    }

    /**
     * 내 업체 영업시간 설정 (업체 관리자) — 연중무휴 여부 + 요일별 영업시간을 통째로 교체한다(지금 요일 행을 소프트 삭제하고 다시 넣는다). (RabbitMQ: admin.store.mine-hours)
     * - 연중무휴 1 → 요일 행을 모두 소프트 삭제한다(hours 가 비어 있지 않으면 400). 연중무휴 0 → 일 ~ 토 7개가 한 번씩(아니면 400)
     * - 휴무가 아닌 요일은 시작 · 마감 둘 다(DTO 짝 필드), 휴무면 둘 다 NULL 로 저장한다(CHK_StoreHour_OpenCloseTime)
     * - 시작 = 마감은 400 — 24시간은 연중무휴로만(사용자 결정 2026-10-27). 마감이 시작보다 이르면 다음 날 마감
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 연중무휴 여부 · 요일별 영업시간
     */
    @Transactional()
    async replaceMyStoreHours(user_id: string, dto: StoreMineHoursDto): Promise<void> {
        // 1. 내 업체 (잠금 — 교체 두 건이 엇갈리지 않게)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 연중무휴 ↔ 요일별 영업시간
        if (dto.is_always_open === 1 && dto.hours.length > 0) {
            throw new BadRequestException({
                message: '24시간 연중무휴면 요일별 영업시간을 비워주세요.',
                validation_errors: createValidationError('hours', '24시간 연중무휴면 요일별 영업시간을 비워주세요.'),
            });
        }
        if (dto.is_always_open === 0 && !hasEveryDayOnce(dto.hours)) {
            throw new BadRequestException({
                message: '일 ~ 토 7개 요일의 영업시간을 한 번씩 입력해주세요.',
                validation_errors: createValidationError('hours', '일 ~ 토 7개 요일의 영업시간을 한 번씩 입력해주세요.'),
            });
        }

        // 3. 영업하는 요일의 시작 = 마감
        const sameIndex = dto.hours.findIndex((hour) => hour.is_closed !== 1 && hour.open_time !== undefined && hour.close_time !== undefined && isSameTimeOfDay(hour.open_time, hour.close_time));
        if (sameIndex >= 0) {
            throw new BadRequestException({
                message: '영업 시작과 마감 시각이 같을 수 없습니다. 24시간 영업은 연중무휴로 설정해주세요.',
                validation_errors: createValidationError(`hours.${sameIndex}.close_time`, '영업 시작과 마감 시각이 같을 수 없습니다. 24시간 영업은 연중무휴로 설정해주세요.'),
            });
        }

        // 4. 교체 — 요일 행 소프트 삭제 → 다시 넣기(연중무휴면 넣지 않는다 — 요일 UK 는 지워지지 않은 행끼리) → 연중무휴 여부
        await this.storeRepository.deleteStoreHours({store_id: store.store_id});
        const entities: StoreHourEntity[] = [];
        for (const hour of dto.hours) {
            const entity = new StoreHourEntity();
            entity.store_hour_id = generateId();
            entity.store_id = store.store_id;
            entity.day_of_week = hour.day_of_week;
            entity.is_closed = hour.is_closed;
            entity.open_time = hour.is_closed === 1 ? null : (hour.open_time ?? null);
            entity.close_time = hour.is_closed === 1 ? null : (hour.close_time ?? null);
            entity.is_deleted = 0;
            entities.push(entity);
        }
        if (entities.length > 0) {
            await this.storeRepository.insertStoreHours(entities);
        }
        const storeEntity = new StoreEntity();
        storeEntity.is_always_open = dto.is_always_open;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }

    /**
     * 내 업체 브레이크타임 설정 (업체 관리자) — 매일 같은 브레이크타임 목록을 통째로 교체한다(빈 배열이면 모두 소프트 삭제한다). (RabbitMQ: admin.store.mine-breaks)
     * - 시작 = 마감은 400. 마감이 시작보다 이르면 다음 날까지(23:30 ~ 00:00 · 23:00 ~ 02:00)
     * - 서로 겹치면 400 — 반열린 구간이라 끝점이 맞닿는 것(09:00 ~ 09:30 + 09:30 ~ 10:00)은 된다(사용자 결정 2026-10-27)
     * - 영업시간 밖이어도 막지 않는다 — 예약 가능 시간 계산(Phase 17)에서 빠질 뿐이다
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 브레이크타임 목록
     */
    @Transactional()
    async replaceMyStoreBreaks(user_id: string, dto: StoreMineBreaksDto): Promise<void> {
        // 1. 내 업체 (잠금 — 교체 두 건이 합쳐져 겹치지 않게)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 시작 = 마감
        const sameIndex = dto.breaks.findIndex((item) => isSameTimeOfDay(item.start_time, item.end_time));
        if (sameIndex >= 0) {
            throw new BadRequestException({
                message: '브레이크타임의 시작과 마감 시각이 같을 수 없습니다.',
                validation_errors: createValidationError(`breaks.${sameIndex}.end_time`, '브레이크타임의 시작과 마감 시각이 같을 수 없습니다.'),
            });
        }

        // 3. 서로 겹침
        if (hasOverlappingBreaks(dto.breaks)) {
            throw new BadRequestException({message: '브레이크타임이 서로 겹칩니다.', validation_errors: createValidationError('breaks', '브레이크타임이 서로 겹칩니다.')});
        }

        // 4. 교체 — 소프트 삭제 → 다시 넣기
        await this.storeRepository.deleteStoreBreaks({store_id: store.store_id});
        const entities: StoreBreakEntity[] = [];
        for (const item of dto.breaks) {
            const entity = new StoreBreakEntity();
            entity.store_break_id = generateId();
            entity.store_id = store.store_id;
            entity.start_time = item.start_time;
            entity.end_time = item.end_time;
            entity.is_deleted = 0;
            entities.push(entity);
        }
        if (entities.length > 0) {
            await this.storeRepository.insertStoreBreaks(entities);
        }
    }

    /**
     * 내 업체 정비시간 설정 (업체 관리자) — 퇴실 후 다음 이용까지 호실을 막는 분. (RabbitMQ: admin.store.mine-maintenance)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 정비시간(분)
     */
    @Transactional()
    async changeMyStoreMaintenance(user_id: string, dto: StoreMineMaintenanceDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.maintenance_minutes = dto.maintenance_minutes;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }

    /**
     * 내 업체 영업중 여부 변경 (업체 관리자) — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님. 같은 값이면 400. (RabbitMQ: admin.store.mine-open)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 영업중 여부
     */
    @Transactional()
    async changeMyStoreOpen(user_id: string, dto: StoreMineOpenDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        if (store.is_open === dto.is_open) {
            throw new BadRequestException({message: STORE_SAME_STATE_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.is_open = dto.is_open;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }

    /**
     * 내 업체 예약 · 환불 규정 설정 (업체 관리자) — 이용 시작 n시간 전부터 예약, n시간 전까지 환불 신청(100%). 적용은 예약 기능(Phase 17)이 한다. (RabbitMQ: admin.store.mine-reservation-policy)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 예약 가능 시작 · 100% 환불 기준(시간)
     */
    @Transactional()
    async changeMyStoreReservationPolicy(user_id: string, dto: StoreMineReservationPolicyDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.booking_open_hours = dto.booking_open_hours;
        storeEntity.refund_deadline_hours = dto.refund_deadline_hours;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }

    /**
     * 내 업체 일시 예약불가 목록 (업체 관리자) — 끝나지 않은 것(종료 일시가 지금 이후)만, 시작 순. (내부 HTTP: GET /internal/v1/admin-service/store/mine/unavailable-period)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getMyStoreUnavailablePeriodList(user_id: string, dto: StoreMineUnavailablePeriodListDto): Promise<StoreMineUnavailablePeriodListResultDto> {
        const store = await this.storeRepository.findStoreByManager(user_id, false);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const where: FindOptionsWhere<StoreUnavailablePeriodEntity> = {store_id: store.store_id, ends_at: MoreThan(new Date())};
        const total_count = await this.storeRepository.countUnavailablePeriods(where);
        const pagination = new Pagination({...dto, total_count});
        const periods = await this.storeRepository.findUnavailablePeriodList(where, pagination.limit, pagination.offset);
        return {list: periods.map(toUnavailablePeriodItem), pagination: pagination.getPagination()};
    }

    /**
     * 내 업체 일시 예약불가 등록 (업체 관리자) — 한국 시각 분 단위 시작 ~ 종료 일시 동안 예약을 받지 않는다. (RabbitMQ: admin.store.mine-unavailable-period)
     * - 없는 날짜(02-30) · 시작 ≥ 종료 · 이미 끝난 범위(종료 ≤ 지금)는 400. 시작이 과거인 진행 중 범위는 된다
     * - 그 업체의 다른 일시 예약불가와 겹치면 400 — 반열린 구간이라 맞닿는 것은 된다(사용자 결정 2026-10-27)
     * - 걸리는 기존 예약은 취소하지 않고 특수 표시한다 — 예약 기능(Phase 17)이 생길 때
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 시작 · 종료 일시 · 메모
     * @returns 일시 예약불가 ID
     */
    @Transactional()
    async addMyStoreUnavailablePeriod(user_id: string, dto: StoreMineUnavailablePeriodDto): Promise<StoreMineUnavailablePeriodResultDto> {
        // 1. 내 업체 (잠금 — 겹침 확인 · 등록을 한 번에 하나)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 일시 — 한국 시각 분 단위. strict 파싱이라 없는 날짜 · 시각(02-30 · 13월)은 isValid() 가 false
        if (!dayjs(dto.starts_at, STORE_DATETIME_FORMAT, true).isValid()) {
            throw new BadRequestException({message: '없는 시작 일시입니다.', validation_errors: createValidationError('starts_at', '없는 시작 일시입니다.')});
        }
        if (!dayjs(dto.ends_at, STORE_DATETIME_FORMAT, true).isValid()) {
            throw new BadRequestException({message: '없는 종료 일시입니다.', validation_errors: createValidationError('ends_at', '없는 종료 일시입니다.')});
        }
        const starts_at = dayjs.tz(dto.starts_at, STORE_DATETIME_FORMAT, KST_TIMEZONE);
        const ends_at = dayjs.tz(dto.ends_at, STORE_DATETIME_FORMAT, KST_TIMEZONE);
        if (!ends_at.isAfter(starts_at)) {
            throw new BadRequestException({message: '종료 일시는 시작 일시보다 늦어야 합니다.', validation_errors: createValidationError('ends_at', '종료 일시는 시작 일시보다 늦어야 합니다.')});
        }
        if (!ends_at.isAfter(dayjs())) {
            throw new BadRequestException({message: '이미 지난 기간은 등록할 수 없습니다.', validation_errors: createValidationError('ends_at', '이미 지난 기간은 등록할 수 없습니다.')});
        }

        // 3. 다른 일시 예약불가와 겹침
        const overlapping = await this.storeRepository.countUnavailablePeriods(buildUnavailablePeriodOverlapWhere(store.store_id, starts_at.toDate(), ends_at.toDate()));
        if (overlapping > 0) {
            throw new BadRequestException({message: '다른 일시 예약불가와 겹칩니다.', validation_errors: createValidationError('starts_at', '다른 일시 예약불가와 겹칩니다.')});
        }

        // 4. 등록
        const period = new StoreUnavailablePeriodEntity();
        period.store_unavailable_period_id = generateId();
        period.store_id = store.store_id;
        period.starts_at = starts_at.toDate();
        period.ends_at = ends_at.toDate();
        period.memo = dto.memo ?? null;
        period.is_deleted = 0;
        await this.storeRepository.insertUnavailablePeriod(period);
        return {store_unavailable_period_id: period.store_unavailable_period_id};
    }

    /**
     * 내 업체 일시 예약불가 삭제 (업체 관리자) — 그 업체 것만 소프트 삭제(행은 남고 목록 · 겹침에서 빠진다), 없으면 404(남의 업체 것 · 이미 삭제된 것 포함). (RabbitMQ: admin.store.mine-unavailable-period-delete)
     *
     * @param user_id 로그인 매니저 ID
     * @param store_unavailable_period_id 일시 예약불가 ID
     */
    @Transactional()
    async removeMyStoreUnavailablePeriod(user_id: string, store_unavailable_period_id: string): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const deleted = await this.storeRepository.deleteUnavailablePeriod({store_unavailable_period_id, store_id: store.store_id});
        if (!deleted) {
            throw new NotFoundException({message: '일시 예약불가를 찾을 수 없습니다.'});
        }
    }
}
