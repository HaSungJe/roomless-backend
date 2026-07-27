import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { StoreEntity } from '../entities/store.entity';
import { StoreRepositoryInterface } from '../interfaces/store.repository.interface';

@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    constructor(
        @InjectRepository(StoreEntity)
        private readonly storeRepository: Repository<StoreEntity>,
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
}
