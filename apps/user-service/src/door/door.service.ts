import {Inject, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {Not} from 'typeorm';
import {matchBcrypt} from '@app/common/utils/bcrypt.js';
import type {DoorCloseDto, DoorCloseResultDto} from '@app/contracts/door/dto/door-close.dto.js';
import type {DoorSnapshotDto, DoorSnapshotResultDto} from '@app/contracts/door/dto/door-snapshot.dto.js';
import type {DoorVerifyDto, DoorVerifyResultDto} from '@app/contracts/door/dto/door-verify.dto.js';
import {DOOR_STATE} from '@app/integration/integration.constants.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import {toDoorTime} from '@app/integration/integration.util.js';
import type {DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import {DOOR_AUTH_FAILED_MESSAGE, DOOR_ROOM_NOT_FOUND_MESSAGE, DOOR_STORE_STATE_LEAVE} from './door.constants.js';
import {DOOR_REPOSITORY} from './door.symbols.js';
import {toDoorSnapshotItem} from './door.util.js';
import type {DoorRepositoryInterface} from './interfaces/door.repository.interface.js';

/**
 * door 비즈니스 로직 — gateway 문 소켓(문 쪽 타 업체 프로그램)의 접속 확인 · QR 확인 · 잠금 알림. 이용자 흐름이라 user-service 에 둔다(사용자 결정 2026-11-07).
 * 업체 관리자의 문 상태 · 바로 열기 · 문 시크릿은 admin-service 다.
 */
@Injectable()
export class DoorService {
    /**
     * @param doorRepository door repository 포트
     * @param doorStore 문 정보 포트 (Redis — 문 상태 · 현재 QR)
     */
    constructor(
        @Inject(DOOR_REPOSITORY) private readonly doorRepository: DoorRepositoryInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * 문 소켓 접속 확인 (gateway 문 소켓) — 지워지지 않고 탈퇴하지 않은 업체 · 시크릿 설정 · bcrypt 일치면 그 업체 호실 전체의 문 상태. 영업 상태는 보지 않는다(문은 영업과 별개).
     * 실패 이유(업체 없음 · 탈퇴 · 시크릿 미설정 · 불일치)는 가르지 않고 모두 401 — 업체가 있는지 알려 주지 않는다. (내부 HTTP: POST /internal/v1/user-service/door/snapshot)
     *
     * @param dto 업체 ID · 시크릿 코드
     * @returns 업체 ID · 호실 문 목록
     * @throws UnauthorizedException 확인 실패
     */
    async getDoorSnapshot(dto: DoorSnapshotDto): Promise<DoorSnapshotResultDto> {
        // 1. 업체 · 시크릿
        const store = await this.doorRepository.findDoorStore({store_id: dto.store_id, store_state_id: Not(DOOR_STORE_STATE_LEAVE)});
        if (!store?.door_secret || !(await matchBcrypt(dto.door_secret, store.door_secret))) {
            throw new UnauthorizedException({message: DOOR_AUTH_FAILED_MESSAGE});
        }

        // 2. 호실 · 문 상태 (업체 전체 — 페이지 없음)
        const rows = await this.doorRepository.findStoreDoorRoomRows(store.store_id);
        const doors = await this.doorStore.getMany(rows.map((row) => row.room_id));
        return {store_id: store.store_id, list: rows.map((row, index) => toDoorSnapshotItem(row, doors[index]))};
    }

    /**
     * 문 소켓 QR 확인 (gateway 문 소켓) — 문이 읽은 QR 을 그 호실의 Redis 현재 QR 과 비교한다. 같으면 open + 지금 시각으로 쓰고 ok, 다르거나 없으면 그대로 두고 ok false.
     * QR 값은 서버 밖으로 나가지 않는다(사용자 결정 2026-11-04). (내부 HTTP: POST /internal/v1/user-service/door/verify)
     *
     * @param dto 업체 ID(소켓이 확인한 값) · 호실 ID · 읽은 QR
     * @returns 호실 ID · 일치 여부
     * @throws NotFoundException 그 업체의 호실이 아닐 때
     */
    async verifyStoreDoor(dto: DoorVerifyDto): Promise<DoorVerifyResultDto> {
        // 1. 그 업체의 호실
        const room = await this.doorRepository.findDoorRoom({room_id: dto.room_id, store_id: dto.store_id});
        if (!room) {
            throw new NotFoundException({message: DOOR_ROOM_NOT_FOUND_MESSAGE});
        }

        // 2. 현재 QR 과 비교 + 같으면 열림 기록 (포트가 스크립트 1개로)
        const ok = await this.doorStore.verify(room.room_id, dto.qr, toDoorTime(new Date()));
        return {room_id: room.room_id, ok};
    }

    /**
     * 문 소켓 잠금 알림 (gateway 문 소켓) — 하드웨어가 잠겼다(잠금 버튼 · 자동 잠금, 인증된 소켓이라 QR 없이). 그 업체의 지워지지 않은 호실이면 close + 지금 시각.
     * (내부 HTTP: POST /internal/v1/user-service/door/close)
     *
     * @param dto 업체 ID(소켓이 확인한 값) · 호실 ID
     * @returns 잠근 문의 room_id · 상태 · 시각
     * @throws NotFoundException 그 업체의 호실이 아닐 때
     */
    async closeStoreDoor(dto: DoorCloseDto): Promise<DoorCloseResultDto> {
        // 1. 그 업체의 호실
        const room = await this.doorRepository.findDoorRoom({room_id: dto.room_id, store_id: dto.store_id});
        if (!room) {
            throw new NotFoundException({message: DOOR_ROOM_NOT_FOUND_MESSAGE});
        }

        // 2. close + 지금 시각
        const changed_at = toDoorTime(new Date());
        await this.doorStore.close(room.room_id, changed_at);
        return {room_id: room.room_id, door_state: DOOR_STATE.CLOSE, door_changed_at: changed_at};
    }
}
