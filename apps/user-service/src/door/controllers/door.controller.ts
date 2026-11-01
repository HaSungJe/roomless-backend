import {Body, Controller, HttpCode, Post} from '@nestjs/common';
import {DoorCloseDto} from '@app/contracts/door/dto/door-close.dto.js';
import {DoorOpenDto, DoorOpenResultDto} from '@app/contracts/door/dto/door-open.dto.js';
import {DoorService} from '../door.service.js';

/**
 * 문 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로만 받는다(외부 비공개, Swagger 없음). 큐 경로는 없다.
 * 내부 토큰 검사는 user-service 전역 InternalAuthGuard(APP_GUARD)가 한다 — 게이트웨이를 거치지 않은 요청은 여기 닿지 않는다.
 */
@Controller('/internal/v1/user-service/door')
export class DoorController {
    /**
     * @param doorService 문 service
     */
    constructor(private readonly doorService: DoorService) {}

    /**
     * QR 로 문 열기
     */
    @Post('/open')
    @HttpCode(200)
    async openDoor(@Body() dto: DoorOpenDto): Promise<DoorOpenResultDto> {
        return this.doorService.openDoor(dto);
    }

    /**
     * 문 닫기
     */
    @Post('/close')
    @HttpCode(200)
    async closeDoor(@Body() dto: DoorCloseDto): Promise<void> {
        return this.doorService.closeDoor(dto);
    }
}
