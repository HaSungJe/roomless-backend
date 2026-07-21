import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiOkResponse, ApiBadRequestResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { RolesGuard } from '@root/guards/roles/roles.guard';
import { Roles } from '@root/guards/roles/roles.decorator';
import { ApiBadRequestResultDto, ApiFailResultDto } from '@root/common/dto/global.result.dto';
import { StoreService } from './store.service';
import { StoreRegisterDto, StoreRegisterResultDto } from './dto/store-register.dto';

@ApiTags('가맹점')
@Controller('/api/v1/store')
export class StoreController {
    constructor(private readonly storeService: StoreService) {}

    /**
     * 가맹점 등록 (SUPER_ADMIN / ADMIN 전용)
     */
    @Post('/register')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(200)
    @ApiOperation({summary: '가맹점 등록'})
    @ApiBody({type: StoreRegisterDto})
    @ApiOkResponse({type: StoreRegisterResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async register(@Body() dto: StoreRegisterDto): Promise<StoreRegisterResultDto> {
        return this.storeService.register(dto);
    }
}
