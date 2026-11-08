import type {FindOptionsWhere} from 'typeorm';
import type {DoorOpenLogEntity} from '@app/database/entities/door/door-open-log.entity.js';
import type {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import type {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 문 소켓 접속 — 업체 호실 문 1개 (QueryBuilder raw — t_room_group 조인, 지워지지 않은 호실 · 그룹) */
export interface DoorRoomRow {
    room_id: string;
    room_name: string;
    floor: number;
}

/**
 * door repository 포트 — 문 소켓이 확인하는 업체 · 호실 · QR 이력을 door 어휘로 읽고, QR 로 연 기록(t_door_open_log)을 쌓는다(공유 DB).
 * WHERE 는 service 가 만들고 repository 는 is_deleted = 0 을 붙여 실행 + DB 오류 변환만 한다.
 */
export interface DoorRepositoryInterface {
    /** 문 소켓 접속 확인의 업체 — 지워지지 않은 업체(조건은 service: 탈퇴 제외) */
    findDoorStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 문 소켓이 가리킨 호실 — 지워지지 않은 호실(조건은 service: 그 업체) */
    findDoorRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
    /** 업체 호실 문 목록 행 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순 */
    findStoreDoorRoomRows(store_id: string): Promise<DoorRoomRow[]>;
    /** 문이 읽은 QR 의 이력 — 그 호실 · 그 QR(UK_RoomQr_Qr), 없으면 null */
    findDoorRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null>;
    /** QR 로 문을 연 기록 등록 */
    insertDoorOpenLog(entity: DoorOpenLogEntity): Promise<void>;
}
