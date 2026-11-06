import type {DoorSnapshotItemResultDto} from '@app/contracts/door/dto/door-snapshot.dto.js';
import type {DoorRecord} from '@app/integration/interfaces/integration.interface.js';
import type {DoorRoomRow} from './interfaces/door.repository.interface.js';

/**
 * 문 소켓 접속 항목 — 호실 + 문 상태.
 *
 * @param row 업체 호실 문 행
 * @param door 그 호실 문 상태
 * @returns 항목
 */
export function toDoorSnapshotItem(row: DoorRoomRow, door: DoorRecord): DoorSnapshotItemResultDto {
    return {room_id: row.room_id, room_name: row.room_name, floor: Number(row.floor), door_state: door.state, door_changed_at: door.changed_at};
}
