import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {DoorOpenLogEntity} from '@app/database/entities/door/door-open-log.entity.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import type {DoorRepositoryInterface, DoorRoomRow} from '../interfaces/door.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * door repository — 문 소켓이 확인하는 업체 · 호실 · QR 이력을 공유 DB 에서 직접 읽고, QR 로 연 기록만 쓴다(문 상태 · 현재 QR 은 Redis).
 */
@Injectable()
export class DoorRepository implements DoorRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_store */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_room */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /** t_room_qr */
    private get roomQrs(): Repository<RoomQrEntity> {
        return this.txHost.tx.getRepository(RoomQrEntity);
    }

    /** t_door_open_log */
    private get doorOpenLogs(): Repository<DoorOpenLogEntity> {
        return this.txHost.tx.getRepository(DoorOpenLogEntity);
    }

    /**
     * 문 소켓 접속 확인의 업체 — 지워지지 않은 업체
     *
     * @param where 조회 조건 (service 는 is_deleted 를 넣지 않는다)
     * @returns 업체 또는 null
     */
    async findDoorStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 문 소켓이 가리킨 호실 — 지워지지 않은 호실
     *
     * @param where 조회 조건 (service 는 is_deleted 를 넣지 않는다)
     * @returns 호실 또는 null
     */
    async findDoorRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null> {
        try {
            return await this.rooms.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 호실 문 목록 행
     *
     * @param store_id 업체 ID
     * @returns 호실 행 (층 · 호실명 순)
     */
    async findStoreDoorRoomRows(store_id: string): Promise<DoorRoomRow[]> {
        try {
            return await this.buildStoreDoorRoomRowsQuery(store_id).getRawMany<DoorRoomRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 호실 문 목록 쿼리 — 지워지지 않은 호실 · 그룹(조인), 층 · 호실명 순(페이지 없음 — 문 소켓 접속 때 업체 전체).
     * 매핑 민감(조인 · raw select — 별칭이 DoorRoomRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreDoorRoomRowsQuery(store_id: string): SelectQueryBuilder<RoomEntity> {
        return this.rooms
            .createQueryBuilder('r')
            .select('r.room_id', 'room_id')
            .addSelect('r.room_name', 'room_name')
            .addSelect('r.floor', 'floor')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = r.room_group_id')
            .where('r.store_id = :store_id', {store_id})
            .andWhere('r.is_deleted = 0')
            .andWhere('g.is_deleted = 0')
            .orderBy('r.floor', 'ASC')
            .addOrderBy('r.room_name', 'ASC');
    }

    /**
     * 문이 읽은 QR 의 이력 — 그 호실 · 그 QR(지우지 않는 표)
     *
     * @param where 조회 조건 (호실 · QR)
     * @returns QR 행 또는 null
     */
    async findDoorRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null> {
        try {
            return await this.roomQrs.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 로 문을 연 기록 등록
     *
     * @param entity new DoorOpenLogEntity() + 할당 (@BeforeInsert 가 돈다)
     */
    async insertDoorOpenLog(entity: DoorOpenLogEntity): Promise<void> {
        try {
            await this.doorOpenLogs.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
