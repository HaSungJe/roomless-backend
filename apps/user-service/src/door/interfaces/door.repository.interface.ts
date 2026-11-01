import type {FindOptionsWhere} from 'typeorm';
import type {RoomEntity} from '@app/database/entities/room/room.entity.js';

/**
 * 문 repository 포트 — 문 정보는 Redis(DOOR_STORE)에 있고, DB 에서는 호실이 있는지만 본다.
 */
export interface DoorRepositoryInterface {
    /**
     * 문을 둘 호실 — 지워지지 않은 호실만(is_deleted = 0 은 repository 가 붙인다)
     *
     * @param where 조건
     * @returns 호실 또는 null
     */
    findDoorRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
}
