import {Body, Controller, HttpCode, Post} from '@nestjs/common';
import {ApiBadRequestResponse, ApiBody, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import {DoorCloseDto} from '@app/contracts/door/dto/door-close.dto.js';
import {DoorOpenDto, DoorOpenResultDto} from '@app/contracts/door/dto/door-open.dto.js';
import {DOOR_INTERNAL_PATH} from '@app/contracts/door/door.commands.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 문 공개 API — 동기 경로(내부 HTTP). 게이트웨이 인바운드 어댑터. 로직 0.
 * 문 쪽 타 업체 프로그램이 부른다 — 로그인 가드가 없고 QR(32자 무작위)이 열쇠다. 큐 경로는 없다.
 */
@ApiTags('문')
@Controller('/api/v1/user-service/door')
export class DoorController {
    /**
     * @param internalHttp 동기 경로 — user-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * QR 로 문 열기 — 예약자 QR 화면에서 읽은 QR 로 부른다. 같은 QR 의 문이 open + 지금 시각이 되고 room_id 를 돌려준다(문을 열지는 부른 쪽이 정한다)
     */
    @Post('/open')
    @HttpCode(200)
    @ApiOperation({summary: 'QR 로 문 열기'})
    @ApiBody({type: DoorOpenDto})
    @ApiOkResponse({type: DoorOpenResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async openDoor(@Body() dto: DoorOpenDto): Promise<DoorOpenResultDto> {
        return this.internalHttp.request<DoorOpenResultDto>('user', 'POST', DOOR_INTERNAL_PATH.OPEN, {body: dto});
    }

    /**
     * 문 닫기 — 권한 없이 그 호실 문을 close + 지금 시각으로(빈 본문). 지워지지 않은 호실이 없으면 404
     */
    @Post('/close')
    @HttpCode(200)
    @ApiOperation({summary: '문 닫기'})
    @ApiBody({type: DoorCloseDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async closeDoor(@Body() dto: DoorCloseDto): Promise<void> {
        return this.internalHttp.request<void>('user', 'POST', DOOR_INTERNAL_PATH.CLOSE, {body: dto});
    }
}
