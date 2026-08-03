import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { StoreEntity } from '../entities/store.entity';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { UserSettingEntity } from '@root/api/v1/user/entities/user-setting.entity';
import { StoreRepositoryInterface } from '../interfaces/store.repository.interface';

@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    constructor(
        @InjectRepository(StoreEntity)
        private readonly storeRepository: Repository<StoreEntity>,
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
        @InjectRepository(UserSettingEntity)
        private readonly userSettingRepository: Repository<UserSettingEntity>,
    ) {}

    /**
     * 가맹점 등록
     */
    async insertStore(entity: StoreEntity): Promise<void> {
        try {
            await this.storeRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1062 && error.sqlMessage.indexOf('UK_Store_BusinessNumber') !== -1) {
                throw new BadRequestException({message: '이미 등록된 사업자등록번호입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /**
     * 가맹점 총 개수 조회 (페이지 계산용)
     */
    async countStore(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number> {
        try {
            return await this.storeRepository.count({where});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 가맹점 목록 조회 — 최근 등록 순
     */
    async findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]> {
        try {
            return await this.storeRepository.find({where, loadRelationIds: true, order: {create_at: 'DESC'}, skip: offset, take: limit});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 가맹점 단건 조회
     */
    async findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.storeRepository.findOne({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 가맹점 수정 — new StoreEntity() + 필드 할당으로 호출(@BeforeUpdate update_at 트리거)
     */
    async updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void> {
        try {
            await this.storeRepository.update(where, entity);
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 가맹점 다건 조회 (인력 목록의 상호명 매핑용 — 페이지네이션 없음)
     */
    async findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]> {
        try {
            return await this.storeRepository.find({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 인력 계정 등록
     */
    async insertStaff(entity: UserEntity): Promise<void> {
        try {
            await this.userRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_LoginId') !== -1) {
                throw new BadRequestException({message: '이미 존재하는 로그인 ID입니다.'});
            } else if (error.errno === 1062 && error.sqlMessage.indexOf('UK_User_UserSearchCode') !== -1) {
                throw new BadRequestException({message: '이미 존재하는 검색 코드입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Auth') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 권한입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_State') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 상태입니다.'});
            } else if (error.errno === 1452 && error.sqlMessage.indexOf('FK_User_Store') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 가맹점입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /**
     * 인력 계정 설정 등록 — 이 행이 없으면 getLoginUser 의 INNER JOIN 에서 걸려 로그인이 불가하다
     */
    async insertStaffSetting(entity: UserSettingEntity): Promise<void> {
        try {
            await this.userSettingRepository.insert(entity);
        } catch (error) {
            if (error.errno === 1452 && error.sqlMessage.indexOf('FK_UserSetting_User') !== -1) {
                throw new BadRequestException({message: '존재하지 않는 회원입니다.'});
            } else {
                throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
            }
        }
    }

    /**
     * 인력 단건 조회
     */
    async findStaff(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.userRepository.findOne({where, loadRelationIds: true});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 인력 총 개수 조회 (페이지 계산용)
     */
    async countStaff(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number> {
        try {
            return await this.userRepository.count({where});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 인력 목록 조회 — 총괄매니저가 위로 오도록 권한 오름차순, 그다음 최근 등록 순
     */
    async findStaffList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]> {
        try {
            return await this.userRepository.find({where, loadRelationIds: true, order: {auth_id: 'ASC', create_at: 'DESC'}, skip: offset, take: limit});
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }

    /**
     * 인력 계정 수정 — new UserEntity() + 필드 할당으로 호출(@BeforeUpdate update_at 트리거)
     */
    async updateStaff(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void> {
        try {
            await this.userRepository.update(where, entity);
        } catch (error) {
            throw new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
        }
    }
}
