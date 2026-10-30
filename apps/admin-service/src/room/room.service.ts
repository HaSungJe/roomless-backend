import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {ILike} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {dayjs} from '@app/common/utils/dayjs.js';
import {generateId} from '@app/common/utils/id.js';
import {Pagination} from '@app/common/utils/pagination.js';
import {toContainsPattern} from '@app/common/utils/search.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {RoomGroupDetailResultDto} from '@app/contracts/room/dto/room-group-detail.dto.js';
import type {RoomGroupImageOrderDto} from '@app/contracts/room/dto/room-group-image-order.dto.js';
import type {RoomGroupImageUploadUrlDto, RoomGroupImageUploadUrlResultDto} from '@app/contracts/room/dto/room-group-image-upload-url.dto.js';
import type {RoomGroupImageDto, RoomGroupImageResultDto} from '@app/contracts/room/dto/room-group-image.dto.js';
import type {RoomGroupListDto, RoomGroupListResultDto} from '@app/contracts/room/dto/room-group-list.dto.js';
import type {RoomGroupPlanPriceListDto, RoomGroupPlanPriceListResultDto} from '@app/contracts/room/dto/room-group-plan-price-list.dto.js';
import type {RoomGroupPlanPriceUpdateDto} from '@app/contracts/room/dto/room-group-plan-price-update.dto.js';
import type {RoomGroupPlanPriceDto, RoomGroupPlanPriceResultDto} from '@app/contracts/room/dto/room-group-plan-price.dto.js';
import type {RoomGroupPlanUpdateDto} from '@app/contracts/room/dto/room-group-plan-update.dto.js';
import type {RoomGroupUpdateDto} from '@app/contracts/room/dto/room-group-update.dto.js';
import type {RoomGroupDto, RoomGroupResultDto} from '@app/contracts/room/dto/room-group.dto.js';
import type {RoomListDto, RoomListResultDto} from '@app/contracts/room/dto/room-list.dto.js';
import type {RoomPlanListResultDto} from '@app/contracts/room/dto/room-plan-list.dto.js';
import type {RoomPlanUpdateDto} from '@app/contracts/room/dto/room-plan-update.dto.js';
import type {RoomStateDto} from '@app/contracts/room/dto/room-state.dto.js';
import type {RoomUpdateDto} from '@app/contracts/room/dto/room-update.dto.js';
import type {RoomDto, RoomResultDto} from '@app/contracts/room/dto/room.dto.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import type {StorageGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
import type {RoomListFilter, RoomRepositoryInterface} from './interfaces/room.repository.interface.js';
import {
    ROOM_DATE_FORMAT,
    ROOM_FILE_KEY_INVALID_MESSAGE,
    ROOM_FILE_NOT_UPLOADED_MESSAGE,
    ROOM_GROUP_IMAGE_LIMIT,
    ROOM_GROUP_IMAGE_LIMIT_MESSAGE,
    ROOM_GROUP_IMAGE_NOT_FOUND_MESSAGE,
    ROOM_GROUP_NOT_FOUND_MESSAGE,
    ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE,
    ROOM_NOT_FOUND_MESSAGE,
    ROOM_PLAN_NOT_FOUND_MESSAGE,
    ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE,
    ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE,
    ROOM_PLAN_PRICE_NOT_FOUND_MESSAGE,
    ROOM_PLAN_PRICE_OVERLAP_MESSAGE,
    ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE,
    ROOM_PLAN_TYPE,
    ROOM_PLAN_TYPE_ORDER,
    ROOM_STATE,
    ROOM_STATE_CHANGE_INVALID_MESSAGE,
} from './room.constants.js';
import {ROOM_REPOSITORY} from './room.symbols.js';
import {
    buildPlanPriceOverlapWhere,
    buildRoomGroupDetail,
    buildRoomGroupImageKey,
    canChangeRoomState,
    isRoomGroupImageKey,
    isSameIdSet,
    isSameTimeOfDay,
    isValidDate,
    nextSortOrder,
    sortByPlanType,
    toRoomGroupDetail,
    toRoomGroupImageItem,
    toRoomGroupListItem,
    toRoomGroupPlanItem,
    toRoomGroupPlanPriceItem,
    toRoomListItem,
    toRoomPlanItem,
} from './room.util.js';

/**
 * room 도메인 비즈니스 로직 (헥사고날의 안쪽) — 업체 관리자(업체 총관리자 · 업체 관리자)가 내 업체의 상품 설정 · 객실 그룹(상세정보 · 사진) · 그룹 상품 · 기간 가격 · 호실 · 호실 상태를 관리한다.
 * 내부 HTTP 컨트롤러와 RabbitMQ 핸들러가 같은 메서드를 호출한다. public 메서드 1개 = API 1개.
 * 모든 메서드는 actor 로 소속 업체를 먼저 찾고(findManagerStore), 쓰기는 업체 행을 잠가 같은 업체의 객실 쓰기(한도 · 겹침 검사)를 한 번에 하나로 한다.
 * 남의 업체 것은 없는 것과 같다 — 그룹은 업체, 사진 · 그룹 상품은 그 그룹, 기간 가격은 그 그룹 상품 조건으로 찾고 없으면 404.
 * 그룹 사진은 모두 공개라 열람 주소는 CDN 공개 주소(getPublicUrl)다.
 */
@Injectable()
export class RoomService {
    /**
     * @param roomRepository room repository 포트
     * @param storageGateway 파일 저장소 포트 (Amazon S3 · CloudFront 공개 주소)
     */
    constructor(
        @Inject(ROOM_REPOSITORY)
        private readonly roomRepository: RoomRepositoryInterface,
        @Inject(STORAGE_GATEWAY)
        private readonly storageGateway: StorageGatewayInterface,
    ) {}

    /**
     * 업체 상품 설정 목록 — 상품 종류 3행(시간 이용 · 1박 · 연박 순). (내부 HTTP: GET /internal/v1/admin-service/room/plan)
     *
     * @param user_id 로그인 매니저 ID
     * @returns 상품 설정 목록
     */
    async getMyRoomPlans(user_id: string): Promise<RoomPlanListResultDto> {
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const rows = await this.roomRepository.findRoomPlanRows(store.store_id);
        return {list: sortByPlanType(rows).map(toRoomPlanItem)};
    }

    /**
     * 업체 상품 설정 수정 — 종류별. 사용 여부 · 예약 가능 요일은 모든 종류, 종류에 필요한 값은 service 가 가른다(CHK_RoomPlan_UsageHoursCheckInOutTime 과 같은 조합). (RabbitMQ: admin.room.plan-update)
     * - 시간 이용(HOURLY): 이용 시간 필수(없으면 400 validation_errors.usage_hours), 입실 · 퇴실 시각은 보내도 NULL
     * - 1박 · 연박: 입실 · 퇴실 시각 필수(없는 필드로 400), 둘이 같으면 400(validation_errors.check_out_time), 이용 시간은 NULL
     *
     * @param user_id 로그인 매니저 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param dto 사용 여부 · 예약 가능 요일 · 이용 시간 · 입실 · 퇴실 시각
     */
    @Transactional()
    async updateMyRoomPlan(user_id: string, room_plan_type_id: string, dto: RoomPlanUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그 종류 행 (입점 승인 때 3행 — 늘 있다)
        const plan = await this.roomRepository.findRoomPlan({store_id: store.store_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 3. 모든 종류 공통
        const entity = new RoomPlanEntity();
        entity.is_used = dto.is_used;
        entity.days_of_week = dto.days_of_week;

        // 4. 종류별 값 — 시간 이용은 이용 시간만, 1박 · 연박은 입실 · 퇴실 시각만
        if (room_plan_type_id === ROOM_PLAN_TYPE.HOURLY) {
            const usage_hours = dto.usage_hours ?? null;
            if (usage_hours === null) {
                throw new BadRequestException({message: '시간 이용은 이용 시간을 입력해주세요.', validation_errors: createValidationError('usage_hours', '시간 이용은 이용 시간을 입력해주세요.')});
            }
            entity.usage_hours = usage_hours;
            entity.check_in_time = null;
            entity.check_out_time = null;
        } else {
            const check_in_time = dto.check_in_time ?? null;
            const check_out_time = dto.check_out_time ?? null;
            if (check_in_time === null) {
                throw new BadRequestException({message: '입실 시각을 입력해주세요.', validation_errors: createValidationError('check_in_time', '입실 시각을 입력해주세요.')});
            }
            if (check_out_time === null) {
                throw new BadRequestException({message: '퇴실 시각을 입력해주세요.', validation_errors: createValidationError('check_out_time', '퇴실 시각을 입력해주세요.')});
            }
            if (isSameTimeOfDay(check_in_time, check_out_time)) {
                throw new BadRequestException({message: '입실과 퇴실 시각이 같을 수 없습니다.', validation_errors: createValidationError('check_out_time', '입실과 퇴실 시각이 같을 수 없습니다.')});
            }
            entity.usage_hours = null;
            entity.check_in_time = check_in_time;
            entity.check_out_time = check_out_time;
        }

        // 5. 수정
        await this.roomRepository.updateRoomPlan({room_plan_id: plan.room_plan_id}, entity);
    }

    /**
     * 객실 그룹 목록 — 검색어(그룹명 부분 일치), 등록일 최신순. 지워지지 않은 호실 수 · 대표 사진(CDN 공개 주소 또는 null) 포함. (내부 HTTP: GET /internal/v1/admin-service/room/group)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 페이지 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getMyRoomGroups(user_id: string, dto: RoomGroupListDto): Promise<RoomGroupListResultDto> {
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const where: FindOptionsWhere<RoomGroupEntity> = dto.keyword ? {store_id: store.store_id, room_group_name: ILike(toContainsPattern(dto.keyword))} : {store_id: store.store_id};
        const total_count = await this.roomRepository.countRoomGroups(where);
        const pagination = new Pagination({...dto, total_count});
        const rows = await this.roomRepository.findRoomGroupRows(where, pagination.limit, pagination.offset);
        return {list: rows.map((row) => toRoomGroupListItem(row, row.cover_file_key ? this.storageGateway.getPublicUrl(row.cover_file_key) : null)), pagination: pagination.getPagination()};
    }

    /**
     * 객실 그룹 상세 — 그룹 · 상세정보(항목 모두) · 사진(순서대로, CDN 공개 주소) · 그룹 상품 3행(시간 이용 · 1박 · 연박 순). (내부 HTTP: GET /internal/v1/admin-service/room/group/:room_group_id)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @returns 그룹 상세
     */
    async getMyRoomGroup(user_id: string, room_group_id: string): Promise<RoomGroupDetailResultDto> {
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const images = await this.roomRepository.findRoomGroupImages(room_group_id);
        const plans = await this.roomRepository.findRoomGroupPlanRows(room_group_id);
        return toRoomGroupDetail(
            group,
            images.map((image) => toRoomGroupImageItem(image, this.storageGateway.getPublicUrl(image.file_key))),
            sortByPlanType(plans).map(toRoomGroupPlanItem),
        );
    }

    /**
     * 객실 그룹 등록 — 그룹 + 그룹 상품 3행(사용 안 함 · 요금 0)을 같은 트랜잭션에서 만든다. (RabbitMQ: admin.room.group-create)
     * - 상세정보는 보낸 알려진 항목 + 지금 기본값으로 전부 저장한다(선언 안 된 키는 버린다 — 사용자 결정 2026-10-31)
     * - 같은 업체의 지워지지 않은 그룹명이면 repository 가 400(UK_RoomGroup_StoreIdRoomGroupName — 선검사 없음)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 그룹명 · 설명 · 상세정보
     * @returns 객실 그룹 ID
     */
    @Transactional()
    async createMyRoomGroup(user_id: string, dto: RoomGroupDto): Promise<RoomGroupResultDto> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그룹 — 설명은 비우면 null, 상세정보는 알려진 항목 + 기본값
        const group = new RoomGroupEntity();
        group.room_group_id = generateId();
        group.store_id = store.store_id;
        group.room_group_name = dto.room_group_name;
        group.description = dto.description || null;
        group.room_group_detail = buildRoomGroupDetail(dto.room_group_detail);
        group.is_deleted = 0;
        await this.roomRepository.insertRoomGroup(group);

        // 3. 그룹 상품 3행 — 사용 안 함 · 요금 0 (요금은 그룹 상품 수정으로)
        const plans = ROOM_PLAN_TYPE_ORDER.map((room_plan_type_id) => {
            const plan = new RoomGroupPlanEntity();
            plan.room_group_plan_id = generateId();
            plan.room_group_id = group.room_group_id;
            plan.room_plan_type_id = room_plan_type_id;
            plan.is_used = 0;
            plan.price = 0;
            return plan;
        });
        await this.roomRepository.insertRoomGroupPlans(plans);
        return {room_group_id: group.room_group_id};
    }

    /**
     * 객실 그룹 수정 — 그룹명 · 설명(비우면 null) · 상세정보(보내면 알려진 항목 + 기본값으로 통째로, 안 보내면 그대로). (RabbitMQ: admin.room.group-update)
     * - 같은 업체의 지워지지 않은 다른 그룹명이면 repository 가 400(UK_RoomGroup_StoreIdRoomGroupName)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param dto 그룹명 · 설명 · 상세정보
     */
    @Transactional()
    async updateMyRoomGroup(user_id: string, room_group_id: string, dto: RoomGroupUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 수정 — 상세정보는 보냈을 때만(안 보내면 undefined 라 update 가 건드리지 않는다)
        const entity = new RoomGroupEntity();
        entity.room_group_name = dto.room_group_name;
        entity.description = dto.description || null;
        if (dto.room_group_detail) {
            entity.room_group_detail = buildRoomGroupDetail(dto.room_group_detail);
        }
        await this.roomRepository.updateRoomGroup({room_group_id: group.room_group_id}, entity);
    }

    /**
     * 객실 그룹 삭제 — 그룹 · 그 그룹의 호실 · 사진을 소프트 삭제하고(사용자 결정 2026-10-31) 사진 저장소 파일을 실제로 지운다(마지막). 그룹 상품 · 기간 가격 행은 남지만 그룹이 지워져 닿을 수 없다. (RabbitMQ: admin.room.group-delete)
     * - 미래 예약 확인은 예약 기능(Phase 17)이 생길 때
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     */
    @Transactional()
    async deleteMyRoomGroup(user_id: string, room_group_id: string): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 지울 저장소 파일 키
        const images = await this.roomRepository.findRoomGroupImages(group.room_group_id);

        // 4. 호실 → 사진 → 그룹 소프트 삭제(is_deleted = 1)
        await this.roomRepository.deleteRooms({room_group_id: group.room_group_id});
        await this.roomRepository.deleteRoomGroupImages({room_group_id: group.room_group_id});
        await this.roomRepository.deleteRoomGroup({room_group_id: group.room_group_id});

        // 5. 저장소 파일 삭제 (마지막)
        for (const image of images) {
            await this.storageGateway.remove(image.file_key);
        }
    }

    /**
     * 객실 그룹 사진 업로드 주소 — 그룹마다 사진 한도(ROOM_GROUP_IMAGE_LIMIT) 안에서만. 키는 서버가 `store/<store_id>/room-group/<room_group_id>/<uuid 32자>.<jpg|png>`(공개 — CDN)로 만든다. (내부 HTTP: POST /internal/v1/admin-service/room/group/:room_group_id/image/upload-url)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param dto MIME 타입
     * @returns 저장 키 · 업로드 주소 · 만료 시각
     */
    async createMyRoomGroupImageUploadUrl(user_id: string, room_group_id: string, dto: RoomGroupImageUploadUrlDto): Promise<RoomGroupImageUploadUrlResultDto> {
        // 1. 내 업체
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 한도
        const images = await this.roomRepository.findRoomGroupImages(group.room_group_id);
        if (images.length >= ROOM_GROUP_IMAGE_LIMIT) {
            throw new BadRequestException({message: ROOM_GROUP_IMAGE_LIMIT_MESSAGE});
        }

        // 4. 키 → 업로드 주소
        const file_key = buildRoomGroupImageKey(store.store_id, group.room_group_id, dto.content_type);
        const upload = await this.storageGateway.createUploadUrl({key: file_key, content_type: dto.content_type});
        return {file_key, upload_url: upload.upload_url, expires_at: upload.expires_at.toISOString()};
    }

    /**
     * 객실 그룹 사진 등록 — 업로드 주소로 올린 사진의 키를 그룹에 붙인다. (RabbitMQ: admin.room.group-image)
     * - 키 모양(그 업체 · 그룹 · 형식) · 한도 · 실제 업로드(exists) 확인
     * - 정렬 순서는 지금 사진의 가장 큰 순서 + 1 — 삭제로 빈 번호가 있어도 마지막에 붙는다
     * - 같은 키면 repository 가 400(UK_RoomGroupImage_FileKey)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param dto 키 · 파일명 · MIME 타입
     * @returns 객실 그룹 사진 ID
     */
    @Transactional()
    async addMyRoomGroupImage(user_id: string, room_group_id: string, dto: RoomGroupImageDto): Promise<RoomGroupImageResultDto> {
        // 1. 내 업체 (잠금 — 한도 확인 · 등록을 한 번에 하나)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 키 모양 — 그 업체 · 그룹 · 형식으로 발급한 키만
        if (!isRoomGroupImageKey(dto.file_key, store.store_id, group.room_group_id, dto.content_type)) {
            throw new BadRequestException({message: ROOM_FILE_KEY_INVALID_MESSAGE, validation_errors: createValidationError('file_key', ROOM_FILE_KEY_INVALID_MESSAGE)});
        }

        // 4. 한도
        const images = await this.roomRepository.findRoomGroupImages(group.room_group_id);
        if (images.length >= ROOM_GROUP_IMAGE_LIMIT) {
            throw new BadRequestException({message: ROOM_GROUP_IMAGE_LIMIT_MESSAGE});
        }

        // 5. 실제로 올라갔는지
        const uploaded = await this.storageGateway.exists(dto.file_key);
        if (!uploaded) {
            throw new BadRequestException({message: ROOM_FILE_NOT_UPLOADED_MESSAGE});
        }

        // 6. 사진 등록 — 마지막 순서
        const image = new RoomGroupImageEntity();
        image.room_group_image_id = generateId();
        image.room_group_id = group.room_group_id;
        image.file_key = dto.file_key;
        image.file_name = dto.file_name;
        image.content_type = dto.content_type;
        image.sort_order = nextSortOrder(images);
        image.is_deleted = 0;
        await this.roomRepository.insertRoomGroupImage(image);
        return {room_group_image_id: image.room_group_image_id};
    }

    /**
     * 객실 그룹 사진 순서 변경 — 지금 사진 ID 전부를 원하는 순서로 받아 0 부터 다시 매긴다(가장 앞이 대표). (RabbitMQ: admin.room.group-image-order)
     * - 빠지거나 남거나 겹치면 400 (validation_errors.room_group_image_ids)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param dto 사진 ID 순서
     */
    @Transactional()
    async reorderMyRoomGroupImages(user_id: string, room_group_id: string, dto: RoomGroupImageOrderDto): Promise<void> {
        // 1. 내 업체 (잠금 — 등록 · 삭제와 엇갈리지 않게)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 지금 사진 전부를 한 번씩
        const images = await this.roomRepository.findRoomGroupImages(group.room_group_id);
        const current = images.map((image) => image.room_group_image_id);
        if (!isSameIdSet(dto.room_group_image_ids, current)) {
            throw new BadRequestException({
                message: '그룹 사진 전체를 한 번씩 원하는 순서로 보내주세요.',
                validation_errors: createValidationError('room_group_image_ids', '그룹 사진 전체를 한 번씩 원하는 순서로 보내주세요.'),
            });
        }

        // 4. 받은 순서대로 0 부터
        for (const [index, room_group_image_id] of dto.room_group_image_ids.entries()) {
            const image = new RoomGroupImageEntity();
            image.sort_order = index;
            await this.roomRepository.updateRoomGroupImage({room_group_image_id}, image);
        }
    }

    /**
     * 객실 그룹 사진 삭제 — 그 그룹의 사진만. 행을 소프트 삭제(is_deleted = 1)한 뒤 저장소 파일을 실제로 지운다(마지막). 남은 사진의 순서 번호는 그대로. (RabbitMQ: admin.room.group-image-delete)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_group_image_id 객실 그룹 사진 ID
     */
    @Transactional()
    async deleteMyRoomGroupImage(user_id: string, room_group_id: string, room_group_image_id: string): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 그 그룹의 사진
        const image = await this.roomRepository.findRoomGroupImage({room_group_image_id, room_group_id: group.room_group_id});
        if (!image) {
            throw new NotFoundException({message: ROOM_GROUP_IMAGE_NOT_FOUND_MESSAGE});
        }

        // 4. 행 소프트 삭제 → 저장소 파일 삭제(마지막)
        await this.roomRepository.deleteRoomGroupImage({room_group_image_id: image.room_group_image_id});
        await this.storageGateway.remove(image.file_key);
    }

    /**
     * 그룹 상품 수정 — 종류별 사용 여부 · 기본 요금. 판매 = 업체 상품 설정 is_used AND 그룹 상품 is_used(예약 — Phase 17). (RabbitMQ: admin.room.group-plan-update)
     * - 판매(is_used 1)인데 요금 0 이면 400 (validation_errors.price)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param dto 사용 여부 · 기본 요금
     */
    @Transactional()
    async updateMyRoomGroupPlan(user_id: string, room_group_id: string, room_plan_type_id: string, dto: RoomGroupPlanUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 그 그룹의 그 종류 그룹 상품 (그룹을 만들 때 3행 — 늘 있다)
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 4. 판매면 요금 1원 이상
        if (dto.is_used === 1 && dto.price === 0) {
            throw new BadRequestException({message: '판매하려면 요금을 1원 이상 입력해주세요.', validation_errors: createValidationError('price', '판매하려면 요금을 1원 이상 입력해주세요.')});
        }

        // 5. 수정
        const entity = new RoomGroupPlanEntity();
        entity.is_used = dto.is_used;
        entity.price = dto.price;
        await this.roomRepository.updateRoomGroupPlan({room_group_plan_id: plan.room_group_plan_id}, entity);
    }

    /**
     * 상품별 기간 가격 목록 — 그룹 상품(그룹 × 종류)의 지워지지 않은 기간 가격, 시작 날짜 순. (내부 HTTP: GET /internal/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getMyRoomGroupPlanPrices(user_id: string, room_group_id: string, room_plan_type_id: string, dto: RoomGroupPlanPriceListDto): Promise<RoomGroupPlanPriceListResultDto> {
        // 1. 내 업체
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹 → 그 종류 그룹 상품
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 3. count → Pagination → 목록
        const where: FindOptionsWhere<RoomGroupPlanPriceEntity> = {room_group_plan_id: plan.room_group_plan_id};
        const total_count = await this.roomRepository.countRoomGroupPlanPrices(where);
        const pagination = new Pagination({...dto, total_count});
        const prices = await this.roomRepository.findRoomGroupPlanPriceList(where, pagination.limit, pagination.offset);
        return {list: prices.map(toRoomGroupPlanPriceItem), pagination: pagination.getPagination()};
    }

    /**
     * 상품별 기간 가격 등록 — 한국 날짜 범위(시작 · 종료 둘 다 포함) 동안 기본 요금 대신 쓴다. (RabbitMQ: admin.room.group-plan-price)
     * - 없는 날짜(02-30 — dayjs strict)는 그 필드로 400, 종료 < 시작이면 400(validation_errors.end_date — 같은 날은 된다)
     * - 같은 그룹 상품의 지워지지 않은 다른 기간과 겹치면 400 — 업체 행 잠금 아래에서 먼저 세고, DB 배타 제약(EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange) 위반도 repository 가 같은 400 으로 바꾼다
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param dto 시작 · 종료 날짜 · 요금 · 메모
     * @returns 기간 가격 ID
     */
    @Transactional()
    async addMyRoomGroupPlanPrice(user_id: string, room_group_id: string, room_plan_type_id: string, dto: RoomGroupPlanPriceDto): Promise<RoomGroupPlanPriceResultDto> {
        // 1. 내 업체 (잠금 — 겹침 확인 · 등록을 한 번에 하나)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹 → 그 종류 그룹 상품
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 3. 날짜 — strict 파싱이라 없는 날짜(02-30 · 13월)는 거부, 종료가 시작보다 이르면 거부(같은 날은 된다)
        if (!isValidDate(dto.start_date)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE, validation_errors: createValidationError('start_date', ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE)});
        }
        if (!isValidDate(dto.end_date)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE, validation_errors: createValidationError('end_date', ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE)});
        }
        const startDate = dayjs(dto.start_date, ROOM_DATE_FORMAT, true);
        const endDate = dayjs(dto.end_date, ROOM_DATE_FORMAT, true);
        if (endDate.isBefore(startDate)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE, validation_errors: createValidationError('end_date', ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE)});
        }

        // 4. 같은 그룹 상품의 다른 기간과 겹침 (둘 다 포함 — 시작 <= 새 종료 AND 종료 >= 새 시작)
        const overlapping = await this.roomRepository.countRoomGroupPlanPrices(buildPlanPriceOverlapWhere(plan.room_group_plan_id, dto.start_date, dto.end_date, null));
        if (overlapping > 0) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_OVERLAP_MESSAGE});
        }

        // 5. 등록 — 메모는 비우면 null
        const planPrice = new RoomGroupPlanPriceEntity();
        planPrice.room_group_plan_price_id = generateId();
        planPrice.room_group_plan_id = plan.room_group_plan_id;
        planPrice.start_date = dto.start_date;
        planPrice.end_date = dto.end_date;
        planPrice.price = dto.price;
        planPrice.memo = dto.memo || null;
        planPrice.is_deleted = 0;
        await this.roomRepository.insertRoomGroupPlanPrice(planPrice);
        return {room_group_plan_price_id: planPrice.room_group_plan_price_id};
    }

    /**
     * 상품별 기간 가격 수정 — 등록과 같은 필드를 통째로. 겹침 검사는 자기 자신을 뺀다(사용자 결정 2026-10-31). (RabbitMQ: admin.room.group-plan-price-update)
     * - 그 그룹 상품의 지워지지 않은 기간 가격만(없거나 남의 것 404)
     * - 날짜 · 겹침 규칙은 등록과 같다(DB 배타 제약 위반도 repository 가 같은 400)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param room_group_plan_price_id 기간 가격 ID
     * @param dto 시작 · 종료 날짜 · 요금 · 메모
     */
    @Transactional()
    async updateMyRoomGroupPlanPrice(user_id: string, room_group_id: string, room_plan_type_id: string, room_group_plan_price_id: string, dto: RoomGroupPlanPriceUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금 — 겹침 확인 · 수정을 한 번에 하나)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹 → 그 종류 그룹 상품 → 그 그룹 상품의 기간 가격
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }
        const planPrice = await this.roomRepository.findRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id: plan.room_group_plan_id});
        if (!planPrice) {
            throw new NotFoundException({message: ROOM_PLAN_PRICE_NOT_FOUND_MESSAGE});
        }

        // 3. 날짜 — 등록과 같다
        if (!isValidDate(dto.start_date)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE, validation_errors: createValidationError('start_date', ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE)});
        }
        if (!isValidDate(dto.end_date)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE, validation_errors: createValidationError('end_date', ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE)});
        }
        const startDate = dayjs(dto.start_date, ROOM_DATE_FORMAT, true);
        const endDate = dayjs(dto.end_date, ROOM_DATE_FORMAT, true);
        if (endDate.isBefore(startDate)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE, validation_errors: createValidationError('end_date', ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE)});
        }

        // 4. 같은 그룹 상품의 다른 기간과 겹침 — 자기 자신 제외
        const overlapping = await this.roomRepository.countRoomGroupPlanPrices(buildPlanPriceOverlapWhere(plan.room_group_plan_id, dto.start_date, dto.end_date, planPrice.room_group_plan_price_id));
        if (overlapping > 0) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_OVERLAP_MESSAGE});
        }

        // 5. 수정 — 메모는 비우면 null
        const entity = new RoomGroupPlanPriceEntity();
        entity.start_date = dto.start_date;
        entity.end_date = dto.end_date;
        entity.price = dto.price;
        entity.memo = dto.memo || null;
        await this.roomRepository.updateRoomGroupPlanPrice({room_group_plan_price_id: planPrice.room_group_plan_price_id}, entity);
    }

    /**
     * 상품별 기간 가격 삭제 — 그 그룹 상품의 것만 소프트 삭제(행은 남고 목록 · 겹침에서 빠진다), 없으면 404(남의 것 · 이미 삭제된 것 포함). (RabbitMQ: admin.room.group-plan-price-delete)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param room_group_plan_price_id 기간 가격 ID
     */
    @Transactional()
    async deleteMyRoomGroupPlanPrice(user_id: string, room_group_id: string, room_plan_type_id: string, room_group_plan_price_id: string): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹 → 그 종류 그룹 상품
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 3. 소프트 삭제 — 0건이면 없는 것
        const deleted = await this.roomRepository.deleteRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id: plan.room_group_plan_id});
        if (!deleted) {
            throw new NotFoundException({message: ROOM_PLAN_PRICE_NOT_FOUND_MESSAGE});
        }
    }

    /**
     * 호실 목록 — 필터(층 · 그룹), 층 · 호실명 순. 그룹명 · 상태명 포함. (내부 HTTP: GET /internal/v1/admin-service/room)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 페이지 · 층 · 그룹
     * @returns 목록 · 페이지 정보
     */
    async getMyRooms(user_id: string, dto: RoomListDto): Promise<RoomListResultDto> {
        // 1. 내 업체
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 필터 — 층은 정수 문자열(DTO 가 형식을 본다)
        const filter: RoomListFilter = {store_id: store.store_id, floor: dto.floor ? Number(dto.floor) : null, room_group_id: dto.room_group_id ?? null};
        const where: FindOptionsWhere<RoomEntity> = {
            store_id: filter.store_id,
            ...(filter.floor === null ? {} : {floor: filter.floor}),
            ...(filter.room_group_id === null ? {} : {room_group_id: filter.room_group_id}),
        };

        // 3. count → Pagination → 목록
        const total_count = await this.roomRepository.countRooms(where);
        const pagination = new Pagination({...dto, total_count});
        const rows = await this.roomRepository.findRoomRows(filter, pagination.limit, pagination.offset);
        return {list: rows.map(toRoomListItem), pagination: pagination.getPagination()};
    }

    /**
     * 호실 등록 — 그 업체의 지워지지 않은 그룹에, 상태는 예약가능(AVAILABLE). 업체는 그룹의 업체(= 내 업체). (RabbitMQ: admin.room.create)
     * - 업체 안 지워지지 않은 호실명이면 repository 가 400(UK_Room_StoreIdRoomName)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 그룹 · 호실명 · 층
     * @returns 호실 ID
     */
    @Transactional()
    async createMyRoom(user_id: string, dto: RoomDto): Promise<RoomResultDto> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id: dto.room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 호실 등록 — 예약가능
        const room = new RoomEntity();
        room.room_id = generateId();
        room.store_id = store.store_id;
        room.room_group_id = group.room_group_id;
        room.room_state_id = ROOM_STATE.AVAILABLE;
        room.room_name = dto.room_name;
        room.floor = dto.floor;
        room.is_deleted = 0;
        await this.roomRepository.insertRoom(room);
        return {room_id: room.room_id};
    }

    /**
     * 호실 수정 — 그룹 · 호실명 · 층을 통째로(그룹 이동은 같은 업체 그룹만). (RabbitMQ: admin.room.update)
     * - 업체 안 지워지지 않은 다른 호실명이면 repository 가 400(UK_Room_StoreIdRoomName)
     * - 미래 예약이 있는 호실의 그룹 이동 제한은 예약 기능(Phase 17)이 생길 때
     *
     * @param user_id 로그인 매니저 ID
     * @param room_id 호실 ID
     * @param dto 그룹 · 호실명 · 층
     */
    @Transactional()
    async updateMyRoom(user_id: string, room_id: string, dto: RoomUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 호실
        const room = await this.roomRepository.findRoom({room_id, store_id: store.store_id});
        if (!room) {
            throw new NotFoundException({message: ROOM_NOT_FOUND_MESSAGE});
        }

        // 3. 옮길 그룹 — 그 업체의 지워지지 않은 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id: dto.room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 4. 수정
        const entity = new RoomEntity();
        entity.room_group_id = group.room_group_id;
        entity.room_name = dto.room_name;
        entity.floor = dto.floor;
        await this.roomRepository.updateRoom({room_id: room.room_id}, entity);
    }

    /**
     * 호실 삭제 — 그 업체의 호실만 소프트 삭제(is_deleted = 1). (RabbitMQ: admin.room.delete)
     * - 미래 예약 확인은 예약 기능(Phase 17)이 생길 때
     *
     * @param user_id 로그인 매니저 ID
     * @param room_id 호실 ID
     */
    @Transactional()
    async deleteMyRoom(user_id: string, room_id: string): Promise<void> {
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const room = await this.roomRepository.findRoom({room_id, store_id: store.store_id});
        if (!room) {
            throw new NotFoundException({message: ROOM_NOT_FOUND_MESSAGE});
        }
        await this.roomRepository.deleteRoom({room_id: room.room_id});
    }

    /**
     * 호실 상태 변경 — 업체 관리자가 바꿀 수 있는 전환만(canChangeRoomState: 정비중 → 예약가능 · 예약가능/정비중 → 사용중지 · 사용중지 → 예약가능). (RabbitMQ: admin.room.state)
     * - 그 밖(예약완료 · 사용중에서, 같은 상태로)은 400 — 입력은 DTO 가 AVAILABLE · DISABLED 만 받는다
     *
     * @param user_id 로그인 매니저 ID
     * @param room_id 호실 ID
     * @param dto 바꿀 상태 (AVAILABLE · DISABLED)
     */
    @Transactional()
    async changeMyRoomState(user_id: string, room_id: string, dto: RoomStateDto): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 호실
        const room = await this.roomRepository.findRoom({room_id, store_id: store.store_id});
        if (!room) {
            throw new NotFoundException({message: ROOM_NOT_FOUND_MESSAGE});
        }

        // 3. 전환 표
        if (!canChangeRoomState(room.room_state_id, dto.room_state_id)) {
            throw new BadRequestException({message: ROOM_STATE_CHANGE_INVALID_MESSAGE});
        }

        // 4. 상태
        const entity = new RoomEntity();
        entity.room_state_id = dto.room_state_id;
        await this.roomRepository.updateRoom({room_id: room.room_id}, entity);
    }
}
