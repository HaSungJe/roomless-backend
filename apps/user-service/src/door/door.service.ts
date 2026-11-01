import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import type {DoorCloseDto} from '@app/contracts/door/dto/door-close.dto.js';
import type {DoorOpenDto, DoorOpenResultDto} from '@app/contracts/door/dto/door-open.dto.js';
import {DOOR_STATE} from '@app/integration/integration.constants.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import type {DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import type {DoorRepositoryInterface} from './interfaces/door.repository.interface.js';
import {DOOR_REPOSITORY} from './door.symbols.js';
import {toDoorTime} from './door.util.js';

/**
 * 문 service — 호실 문의 열림/닫힘 · 마지막 시각을 문 정보 포트(Redis)에 남긴다.
 * 서버는 문을 직접 움직이지 않는다 — 문 쪽 타 업체 프로그램이 이 결과를 보고 문을 연다. DB 쓰기가 없어 `@Transactional()` 이 없다.
 */
@Injectable()
export class DoorService {
    /**
     * @param doorRepository 문 repository 포트 (호실 확인)
     * @param doorStore 문 정보 포트 (Redis)
     */
    constructor(
        @Inject(DOOR_REPOSITORY) private readonly doorRepository: DoorRepositoryInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * QR 로 문 열기 — 같은 QR 을 가진 문을 open + 지금 시각으로 바꾸고 그 호실을 돌려준다. 여기까지만 한다(체크인 · 예약 확인 없음).
     * (내부 HTTP: POST /internal/v1/user-service/door/open)
     *
     * @param dto QR 정보
     * @returns 연 문의 room_id · 상태 · 시각
     * @throws NotFoundException 일치하는 QR 의 문이 없을 때
     */
    async openDoor(dto: DoorOpenDto): Promise<DoorOpenResultDto> {
        // 1. 지금 시각 (한국 시각 yyyyMMddHHmmss)
        const changed_at = toDoorTime(new Date());

        // 2. QR 이 같은 문을 open — 찾기와 쓰기는 포트가 한 번에
        const room_id = await this.doorStore.open(dto.qr, changed_at);
        if (!room_id) {
            throw new NotFoundException({message: '일치하는 QR 정보가 없습니다.'});
        }
        return {room_id, door_state: DOOR_STATE.OPEN, door_changed_at: changed_at};
    }

    /**
     * 문 닫기 — 권한 없이 그 호실 문을 close + 지금 시각으로 바꾼다. 지워지지 않은 호실이 없으면 404(아무 값으로 Redis 키가 쌓이지 않게).
     * (내부 HTTP: POST /internal/v1/user-service/door/close)
     *
     * @param dto 호실 ID
     * @throws NotFoundException 호실이 없을 때
     */
    async closeDoor(dto: DoorCloseDto): Promise<void> {
        // 1. 호실
        const room = await this.doorRepository.findDoorRoom({room_id: dto.room_id});
        if (!room) {
            throw new NotFoundException({message: '호실을 찾을 수 없습니다.'});
        }

        // 2. close + 지금 시각
        await this.doorStore.close(room.room_id, toDoorTime(new Date()));
    }
}
