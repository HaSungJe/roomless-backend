import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { v4 } from 'uuid';
import { In } from 'typeorm';
import { Pagination } from '@root/common/utils/pagination';
import { getBcrypt } from '@root/common/utils/bcrypt';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { UserSettingEntity } from '@root/api/v1/user/entities/user-setting.entity';
import { StoreEntity } from './entities/store.entity';
import { StoreRegisterDto, StoreRegisterResultDto } from './dto/store-register.dto';
import { StoreListDto, StoreListResultDto } from './dto/store-list.dto';
import { StoreDetailParamDto, StoreDetailResultDto } from './dto/store-detail.dto';
import { StoreModifyParamDto, StoreModifyDto } from './dto/store-modify.dto';
import { StoreRemoveParamDto } from './dto/store-remove.dto';
import { StoreHeadManagerRegisterDto, StoreHeadManagerRegisterResultDto } from './dto/store-head-manager-register.dto';
import { StoreManagerRegisterDto, StoreManagerRegisterResultDto } from './dto/store-manager-register.dto';
import { StoreStaffListDto, StoreStaffListResultDto } from './dto/store-staff-list.dto';
import { StoreStaffRemoveParamDto } from './dto/store-staff-remove.dto';
import { buildStoreSearchWhere, buildStoreDeleteBackup, buildStaffSearchWhere, generateTemporaryPassword } from './store.util';
import { STORE_REPOSITORY } from './store.symbols';
import type { StoreRepositoryInterface } from './interfaces/store.repository.interface';

@Injectable()
export class StoreService {
    constructor(
        @Inject(STORE_REPOSITORY)
        private readonly storeRepository: StoreRepositoryInterface,
    ) {}

    /**
     * 가맹점 등록 — 관리자(SUPER_ADMIN/ADMIN)가 가맹점 header 정보를 등록하고 생성된 ID 를 반환.
     */
    @Transactional()
    async register(dto: StoreRegisterDto): Promise<StoreRegisterResultDto> {
        // 1. ID 생성
        const store_id = v4().replace(/-/g, '');

        // 2. t_store 생성 (사업자등록번호 중복은 UK_Store_BusinessNumber 분기 400)
        const storeEntity = new StoreEntity();
        storeEntity.store_id = store_id;
        storeEntity.store_name = dto.store_name;
        storeEntity.business_number = dto.business_number;
        storeEntity.owner_name = dto.owner_name;
        storeEntity.phone = dto.phone;
        storeEntity.address = dto.address;
        storeEntity.address_detail = dto.address_detail ?? null;
        storeEntity.is_delete = 0;
        storeEntity.delete_backup = null;
        await this.storeRepository.insertStore(storeEntity);

        return {store_id};
    }

    /**
     * 가맹점 목록 조회 — 총 개수를 먼저 세고, Pagination 이 산출한 limit/offset 으로 목록을 가져온다.
     * (Pagination 생성자가 total_count 를 입력으로 받는 구조라 count → list 순서가 강제된다)
     */
    async list(dto: StoreListDto): Promise<StoreListResultDto> {
        // 1. 검색 WHERE 조립 (is_delete=0 고정)
        const where = buildStoreSearchWhere(dto.search_type, dto.search_keyword);

        // 2. 총 개수 → 페이지 계산
        const total_count = await this.storeRepository.countStore(where);
        const pagination = new Pagination({
            all_search_yn: dto.all_search_yn as 'Y' | 'N',
            total_count,
            page: dto.page,
            size: dto.size,
            page_size: dto.page_size,
        });

        // 3. 목록 조회
        const stores = await this.storeRepository.findStoreList(where, pagination.limit, pagination.offset);

        return {
            list: stores.map((store) => ({
                store_id: store.store_id,
                store_name: store.store_name,
                business_number: store.business_number,
                owner_name: store.owner_name,
                phone: store.phone,
                address: store.address,
                address_detail: store.address_detail,
                create_at: store.create_at,
                update_at: store.update_at,
            })),
            pagination: pagination.getPagination(),
        };
    }

    /**
     * 가맹점 상세 조회 — 삭제된 가맹점은 조회 대상이 아니다.
     */
    async detail(param: StoreDetailParamDto): Promise<StoreDetailResultDto> {
        const store = await this.storeRepository.findStore({store_id: param.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        return {
            store_id: store.store_id,
            store_name: store.store_name,
            business_number: store.business_number,
            owner_name: store.owner_name,
            phone: store.phone,
            address: store.address,
            address_detail: store.address_detail,
            create_at: store.create_at,
            update_at: store.update_at,
        };
    }

    /**
     * 가맹점 수정 — 사업자등록번호는 변경 대상이 아니다(DTO 에 필드 자체가 없음).
     */
    @Transactional()
    async modify(param: StoreModifyParamDto, dto: StoreModifyDto): Promise<void> {
        // 1. 대상 확인 (삭제된 가맹점은 수정 불가)
        const store = await this.storeRepository.findStore({store_id: param.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 2. 전달된 필드 전체 덮어쓰기 (address_detail 미전달 시 null — update 는 undefined 를 무시하므로 명시 필요)
        const storeEntity = new StoreEntity();
        storeEntity.store_name = dto.store_name;
        storeEntity.owner_name = dto.owner_name;
        storeEntity.phone = dto.phone;
        storeEntity.address = dto.address;
        storeEntity.address_detail = dto.address_detail ?? null;
        await this.storeRepository.updateStore({store_id: param.store_id}, storeEntity);
    }

    /**
     * 가맹점 삭제 — soft delete + 사업자등록번호 마스킹.
     * business_number 를 DELETE_<store_id> 로 치환해 UK_Store_BusinessNumber 를 비우고,
     * 삭제 직전 스냅샷을 delete_backup 에 남긴다. 같은 사업자등록번호로 재등록이 가능해진다.
     */
    @Transactional()
    async remove(param: StoreRemoveParamDto): Promise<void> {
        // 1. 대상 확인 (이미 삭제된 가맹점은 재삭제 불가)
        const store = await this.storeRepository.findStore({store_id: param.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 2. 백업 + 마스킹 + 삭제 플래그 (나머지 컬럼은 손대지 않는다)
        const storeEntity = new StoreEntity();
        storeEntity.is_delete = 1;
        storeEntity.business_number = `DELETE_${store.store_id}`;
        storeEntity.delete_backup = buildStoreDeleteBackup(store);
        await this.storeRepository.updateStore({store_id: param.store_id}, storeEntity);
    }

    /**
     * 총괄매니저 계정 생성 — ADMIN 이 업체를 지정해 만든다. 업체당 1명 고정.
     * 임시 비밀번호를 발급해 응답에 1회 노출하고, 저장은 bcrypt 해시만 한다.
     */
    @Transactional()
    async headManagerRegister(dto: StoreHeadManagerRegisterDto): Promise<StoreHeadManagerRegisterResultDto> {
        // 1. 대상 가맹점 확인 (삭제된 가맹점에는 배정 불가)
        const store = await this.storeRepository.findStore({store_id: dto.store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 2. 업체당 총괄매니저 1명 고정 — 이미 있으면 거부
        const existing = await this.storeRepository.findStaff({store_id: dto.store_id, auth_id: 'HEAD_MANAGER', state_id: In(['ACTIVE', 'BLOCK', 'LEAVE_WAIT'])});
        if (existing) {
            throw new BadRequestException({message: '이미 총괄매니저가 지정된 가맹점입니다.'});
        }

        // 3. 계정 생성 (login_id 중복은 UK_User_LoginId 분기 400)
        const temporary_password = generateTemporaryPassword();
        const user_id = v4().replace(/-/g, '');
        const userEntity = new UserEntity();
        userEntity.user_id = user_id;
        userEntity.user_search_code = v4().replace(/-/g, '');
        userEntity.auth_id = 'HEAD_MANAGER';
        userEntity.state_id = 'ACTIVE';
        userEntity.store_id = dto.store_id;
        userEntity.sns_id = null;
        userEntity.sns_user_id = null;
        userEntity.login_id = dto.login_id;
        userEntity.login_pw = await getBcrypt(temporary_password);
        userEntity.name = dto.name;
        userEntity.gender = dto.gender;
        userEntity.birth = dto.birth;
        userEntity.phone = null;
        userEntity.nickname = dto.nickname;
        userEntity.device_os = null;
        userEntity.device_token = null;
        userEntity.is_password_change_required = 1;
        await this.storeRepository.insertStaff(userEntity);

        // 4. t_user_setting 동반 생성 — 없으면 getLoginUser 의 INNER JOIN 에서 걸려 로그인 불가
        const userSettingEntity = new UserSettingEntity();
        userSettingEntity.user_setting_id = v4().replace(/-/g, '');
        userSettingEntity.user_id = user_id;
        userSettingEntity.bio = null;
        await this.storeRepository.insertStaffSetting(userSettingEntity);

        return {user_id, login_id: dto.login_id, temporary_password};
    }

    /**
     * 매니저 계정 생성 — 총괄매니저가 자기 업체에 만든다. store_id 는 요청자 것으로 자동 확정.
     */
    @Transactional()
    async managerRegister(store_id: string, dto: StoreManagerRegisterDto): Promise<StoreManagerRegisterResultDto> {
        // 1. 요청자 소속 확인 (데이터 이상 방어)
        if (!store_id) {
            throw new BadRequestException({message: '소속된 가맹점이 없습니다.'});
        }

        // 2. 대상 가맹점 확인 (폐점된 업체에는 충원 불가)
        const store = await this.storeRepository.findStore({store_id, is_delete: 0});
        if (!store) {
            throw new NotFoundException({message: '가맹점을 찾을 수 없습니다.'});
        }

        // 3. 계정 생성 — 매니저 수 상한 없음
        const temporary_password = generateTemporaryPassword();
        const user_id = v4().replace(/-/g, '');
        const userEntity = new UserEntity();
        userEntity.user_id = user_id;
        userEntity.user_search_code = v4().replace(/-/g, '');
        userEntity.auth_id = 'MANAGER';
        userEntity.state_id = 'ACTIVE';
        userEntity.store_id = store_id;
        userEntity.sns_id = null;
        userEntity.sns_user_id = null;
        userEntity.login_id = dto.login_id;
        userEntity.login_pw = await getBcrypt(temporary_password);
        userEntity.name = dto.name;
        userEntity.gender = dto.gender;
        userEntity.birth = dto.birth;
        userEntity.phone = null;
        userEntity.nickname = dto.nickname;
        userEntity.device_os = null;
        userEntity.device_token = null;
        userEntity.is_password_change_required = 1;
        await this.storeRepository.insertStaff(userEntity);

        // 4. t_user_setting 동반 생성
        const userSettingEntity = new UserSettingEntity();
        userSettingEntity.user_setting_id = v4().replace(/-/g, '');
        userSettingEntity.user_id = user_id;
        userSettingEntity.bio = null;
        await this.storeRepository.insertStaffSetting(userSettingEntity);

        return {user_id, login_id: dto.login_id, temporary_password};
    }

    /**
     * 업체 인력 목록 — ADMIN 은 전 업체(store_id 로 좁힐 수 있음), 총괄매니저는 자기 업체로 강제 고정.
     */
    async staffList(auth_id: string, my_store_id: string, dto: StoreStaffListDto): Promise<StoreStaffListResultDto> {
        // 1. 스코프 결정 — 총괄매니저는 파라미터를 보내도 무시하고 자기 업체로 고정
        const scoped_store_id = auth_id === 'HEAD_MANAGER' ? my_store_id : dto.store_id;
        const where = buildStaffSearchWhere(scoped_store_id, dto.auth_id, dto.search_keyword);

        // 2. 총 개수 → 페이지 계산
        const total_count = await this.storeRepository.countStaff(where);
        const pagination = new Pagination({
            all_search_yn: dto.all_search_yn as 'Y' | 'N',
            total_count,
            page: dto.page,
            size: dto.size,
            page_size: dto.page_size,
        });

        // 3. 목록 조회
        const staffs = await this.storeRepository.findStaffList(where, pagination.limit, pagination.offset);

        // 4. 상호명 매핑 (한 번의 추가 조회로 해결 — 행마다 조회하지 않는다)
        const store_ids = [...new Set(staffs.map((staff) => staff.store_id).filter((id) => !!id))];
        const stores = store_ids.length > 0 ? await this.storeRepository.findStores({store_id: In(store_ids)}) : [];
        const storeNames = new Map(stores.map((store) => [store.store_id, store.store_name]));

        return {
            list: staffs.map((staff) => ({
                user_id: staff.user_id,
                login_id: staff.login_id,
                name: staff.name,
                nickname: staff.nickname,
                auth_id: staff.auth_id,
                state_id: staff.state_id,
                store_id: staff.store_id,
                store_name: staff.store_id ? (storeNames.get(staff.store_id) ?? null) : null,
                create_at: staff.create_at,
            })),
            pagination: pagination.getPagination(),
        };
    }

    /**
     * 인력 계정 삭제 — state_id 를 LEAVE 로 전이하는 soft delete.
     * t_state 의 LEAVE 는 is_login_able=0 이라 getLoginUser 에서 걸러져 즉시 로그인이 차단된다.
     * store_id 는 지우지 않는다 — 소속 이력 보존 + 미배정 계정을 만들지 않기 위해.
     */
    @Transactional()
    async staffRemove(auth_id: string, my_store_id: string, param: StoreStaffRemoveParamDto): Promise<void> {
        // 1. 대상 확인 (이미 LEAVE 면 404)
        const staff = await this.storeRepository.findStaff({user_id: param.user_id, auth_id: In(['HEAD_MANAGER', 'MANAGER']), state_id: In(['ACTIVE', 'BLOCK', 'LEAVE_WAIT'])});
        if (!staff) {
            throw new NotFoundException({message: '인력을 찾을 수 없습니다.'});
        }

        // 2. 총괄매니저는 자기 업체의 MANAGER 만 삭제할 수 있다 (자신·타 총괄 삭제 불가)
        if (auth_id === 'HEAD_MANAGER' && (staff.store_id !== my_store_id || staff.auth_id !== 'MANAGER')) {
            throw new ForbiddenException({message: '접근 권한이 없습니다.'});
        }

        // 3. 상태 전이 — store_id 는 그대로 둔다
        const userEntity = new UserEntity();
        userEntity.state_id = 'LEAVE';
        await this.storeRepository.updateStaff({user_id: param.user_id}, userEntity);
    }
}
