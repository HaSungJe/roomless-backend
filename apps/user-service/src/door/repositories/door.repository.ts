import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository} from 'typeorm';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import type {DoorRepositoryInterface} from '../interfaces/door.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * door repository (아웃바운드 어댑터) — 공유 DB 의 t_room(room 도메인 테이블)을 door 어휘로 읽기만 한다.
 * 문 정보 자체는 Redis 포트(DOOR_STORE)에 있다. 조회에는 항상 is_deleted = 0 을 붙인다(notDeleted).
 */
@Injectable()
export class DoorRepository implements DoorRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_room */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /**
     * 문을 둘 호실 — 지워지지 않은 호실만
     *
     * @param where 조건 (service 는 is_deleted 를 넣지 않는다)
     * @returns 호실 또는 null
     */
    async findDoorRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null> {
        try {
            return await this.rooms.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
