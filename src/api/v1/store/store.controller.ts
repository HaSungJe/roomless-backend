import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiOkResponse, ApiNoContentResponse, ApiBadRequestResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { RolesGuard } from '@root/guards/roles/roles.guard';
import { Roles } from '@root/guards/roles/roles.decorator';
import { PassportUser } from '@root/guards/passport.jwt.auth/passport.jwt.auth.decorator';
import { ApiBadRequestResultDto, ApiFailResultDto } from '@root/common/dto/global.result.dto';
import { StoreService } from './store.service';
import { StoreHeadManagerRegisterDto, StoreHeadManagerRegisterResultDto } from './dto/store-head-manager-register.dto';
import { StoreManagerRegisterDto, StoreManagerRegisterResultDto } from './dto/store-manager-register.dto';
import { StoreStaffListDto, StoreStaffListResultDto } from './dto/store-staff-list.dto';
import { StoreStaffRemoveParamDto } from './dto/store-staff-remove.dto';
import { StoreRegisterDto, StoreRegisterResultDto } from './dto/store-register.dto';
import { StoreListDto, StoreListResultDto } from './dto/store-list.dto';
import { StoreDetailParamDto, StoreDetailResultDto } from './dto/store-detail.dto';
import { StoreModifyParamDto, StoreModifyDto } from './dto/store-modify.dto';
import { StoreRemoveParamDto } from './dto/store-remove.dto';

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

    /**
     * 가맹점 목록 조회 (SUPER_ADMIN / ADMIN 전용)
     * Query DTO 규약 — 받은 쿼리를 생성자에 태워 기본값이 확정된 인스턴스를 service 에 넘긴다.
     */
    @Get('/list')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(200)
    @ApiOperation({summary: '가맹점 목록 조회'})
    @ApiOkResponse({type: StoreListResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async list(@Query() query: StoreListDto): Promise<StoreListResultDto> {
        const dto = new StoreListDto(query);
        return this.storeService.list(dto);
    }

    /**
     * 가맹점 상세 조회 (SUPER_ADMIN / ADMIN 전용)
     */
    @Get('/detail/:store_id')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(200)
    @ApiOperation({summary: '가맹점 상세 조회'})
    @ApiOkResponse({type: StoreDetailResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async detail(@Param() param: StoreDetailParamDto): Promise<StoreDetailResultDto> {
        return this.storeService.detail(param);
    }

    /**
     * 가맹점 수정 (SUPER_ADMIN / ADMIN 전용)
     */
    @Patch('/modify/:store_id')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(204)
    @ApiOperation({summary: '가맹점 수정'})
    @ApiBody({type: StoreModifyDto})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async modify(@Param() param: StoreModifyParamDto, @Body() dto: StoreModifyDto): Promise<void> {
        return this.storeService.modify(param, dto);
    }

    /**
     * 가맹점 삭제 (SUPER_ADMIN / ADMIN 전용)
     */
    @Delete('/remove/:store_id')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(204)
    @ApiOperation({summary: '가맹점 삭제'})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async remove(@Param() param: StoreRemoveParamDto): Promise<void> {
        return this.storeService.remove(param);
    }

    /**
     * 총괄매니저 계정 생성 (SUPER_ADMIN / ADMIN 전용)
     */
    @Post('/head-manager/register')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN')
    @HttpCode(200)
    @ApiOperation({summary: '총괄매니저 계정 생성'})
    @ApiBody({type: StoreHeadManagerRegisterDto})
    @ApiOkResponse({type: StoreHeadManagerRegisterResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async headManagerRegister(@Body() dto: StoreHeadManagerRegisterDto): Promise<StoreHeadManagerRegisterResultDto> {
        return this.storeService.headManagerRegister(dto);
    }

    /**
     * 매니저 계정 생성 (총괄매니저 전용 — 자기 업체에 충원)
     */
    @Post('/manager/register')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('HEAD_MANAGER')
    @HttpCode(200)
    @ApiOperation({summary: '매니저 계정 생성'})
    @ApiBody({type: StoreManagerRegisterDto})
    @ApiOkResponse({type: StoreManagerRegisterResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async managerRegister(@PassportUser('store_id') store_id: string, @Body() dto: StoreManagerRegisterDto): Promise<StoreManagerRegisterResultDto> {
        return this.storeService.managerRegister(store_id, dto);
    }

    /**
     * 업체 인력 목록 조회 (ADMIN 전체 / 총괄매니저 자기 업체)
     */
    @Get('/staff/list')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN', 'HEAD_MANAGER')
    @HttpCode(200)
    @ApiOperation({summary: '업체 인력 목록 조회'})
    @ApiOkResponse({type: StoreStaffListResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async staffList(@PassportUser('auth_id') auth_id: string, @PassportUser('store_id') store_id: string, @Query() query: StoreStaffListDto): Promise<StoreStaffListResultDto> {
        const dto = new StoreStaffListDto(query);
        return this.storeService.staffList(auth_id, store_id, dto);
    }

    /**
     * 인력 계정 삭제 (ADMIN 은 인력 전체 / 총괄매니저는 자기 업체 매니저만)
     */
    @Delete('/staff/remove/:user_id')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles('SUPER_ADMIN', 'ADMIN', 'HEAD_MANAGER')
    @HttpCode(204)
    @ApiOperation({summary: '인력 계정 삭제'})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async staffRemove(@PassportUser('auth_id') auth_id: string, @PassportUser('store_id') store_id: string, @Param() param: StoreStaffRemoveParamDto): Promise<void> {
        return this.storeService.staffRemove(auth_id, store_id, param);
    }
}
