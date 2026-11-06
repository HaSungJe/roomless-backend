import {Body, Controller, HttpCode, Post} from '@nestjs/common';
import {DoorCloseDto, DoorCloseResultDto} from '@app/contracts/door/dto/door-close.dto.js';
import {DoorSnapshotDto, DoorSnapshotResultDto} from '@app/contracts/door/dto/door-snapshot.dto.js';
import {DoorVerifyDto, DoorVerifyResultDto} from '@app/contracts/door/dto/door-verify.dto.js';
import {DoorService} from '../door.service.js';

/**
 * door 내부 HTTP 인바운드 어댑터 — gateway 문 소켓만 부른다(외부 비공개, Swagger 없음). actor 없이 내부 토큰만(업체는 소켓 접속 때 확인한 값). 내부 토큰 검사는 전역 InternalAuthGuard 가 한다.
 */
@Controller('/internal/v1/user-service/door')
export class DoorController {
    /**
     * @param doorService door 비즈니스 로직
     */
    constructor(private readonly doorService: DoorService) {}

    /**
     * 문 소켓 접속 확인 (gateway 문 소켓 — actor 없음, 내부 토큰만)
     */
    @Post('/snapshot')
    @HttpCode(200)
    async getDoorSnapshot(@Body() dto: DoorSnapshotDto): Promise<DoorSnapshotResultDto> {
        return this.doorService.getDoorSnapshot(dto);
    }

    /**
     * 문 소켓 QR 확인 (gateway 문 소켓 — actor 없음, 내부 토큰만)
     */
    @Post('/verify')
    @HttpCode(200)
    async verifyStoreDoor(@Body() dto: DoorVerifyDto): Promise<DoorVerifyResultDto> {
        return this.doorService.verifyStoreDoor(dto);
    }

    /**
     * 문 소켓 잠금 알림 (gateway 문 소켓 — actor 없음, 내부 토큰만)
     */
    @Post('/close')
    @HttpCode(200)
    async closeStoreDoor(@Body() dto: DoorCloseDto): Promise<DoorCloseResultDto> {
        return this.doorService.closeStoreDoor(dto);
    }
}
