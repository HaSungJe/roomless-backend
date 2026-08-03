import { Body, Controller, Delete, HttpCode, Ip, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiOkResponse, ApiBadRequestResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { PassportUser } from '@root/guards/passport.jwt.auth/passport.jwt.auth.decorator';
import { ApiBadRequestResultDto, ApiFailResultDto } from '@root/common/dto/global.result.dto';
import { UserService } from './user.service';
import { UserSignDto, UserSignResultDto } from './dto/user-sign.dto';
import { UserLoginDto, UserLoginResultDto } from './dto/user-login.dto';
import { UserTokenRefreshDto, UserTokenRefreshResultDto } from './dto/user-token-refresh.dto';
import { UserLeaveDto } from './dto/user-leave.dto';
import { UserGeneralSignDto, UserGeneralSignResultDto } from './dto/user-general-sign.dto';
import { UserGeneralLoginDto, UserGeneralLoginResultDto } from './dto/user-general-login.dto';
import { UserPasswordDto } from './dto/user-password.dto';

@ApiTags('회원')
@Controller('/api/v1/user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    /**
     * SNS 회원가입
     */
    @Post('/sign')
    @HttpCode(200)
    @ApiOperation({summary: 'SNS 회원가입'})
    @ApiBody({type: UserSignDto})
    @ApiOkResponse({type: UserSignResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sign(@Body() dto: UserSignDto, @Ip() ip: string): Promise<UserSignResultDto> {
        return this.userService.sign(dto, ip);
    }

    /**
     * SNS 로그인
     */
    @Post('/login')
    @HttpCode(200)
    @ApiOperation({summary: 'SNS 로그인'})
    @ApiBody({type: UserLoginDto})
    @ApiOkResponse({type: UserLoginResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async login(@Body() dto: UserLoginDto, @Ip() ip: string): Promise<UserLoginResultDto> {
        return this.userService.login(dto, ip);
    }

    /**
     * 일반 회원가입 (아이디/비밀번호)
     */
    @Post('/general-sign')
    @HttpCode(200)
    @ApiOperation({summary: '일반 회원가입'})
    @ApiBody({type: UserGeneralSignDto})
    @ApiOkResponse({type: UserGeneralSignResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async generalSign(@Body() dto: UserGeneralSignDto, @Ip() ip: string): Promise<UserGeneralSignResultDto> {
        return this.userService.generalSign(dto, ip);
    }

    /**
     * 일반 로그인 (아이디/비밀번호)
     */
    @Post('/general-login')
    @HttpCode(200)
    @ApiOperation({summary: '일반 로그인'})
    @ApiBody({type: UserGeneralLoginDto})
    @ApiOkResponse({type: UserGeneralLoginResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async generalLogin(@Body() dto: UserGeneralLoginDto, @Ip() ip: string): Promise<UserGeneralLoginResultDto> {
        return this.userService.generalLogin(dto, ip);
    }

    /**
     * 로그인 토큰 재발급
     */
    @Post('/token-refresh')
    @HttpCode(200)
    @ApiOperation({summary: '로그인 토큰 재발급'})
    @ApiBody({type: UserTokenRefreshDto})
    @ApiOkResponse({type: UserTokenRefreshResultDto})
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async tokenRefresh(@Body() dto: UserTokenRefreshDto, @Ip() ip: string): Promise<UserTokenRefreshResultDto> {
        return this.userService.tokenRefresh(dto, ip);
    }

    /**
     * 회원 탈퇴 신청 (LEAVE_WAIT 전환, 14일 후 자동 처리 예약)
     */
    @Delete('/leave')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(204)
    @ApiOperation({summary: '회원 탈퇴 신청'})
    @ApiBody({type: UserLeaveDto})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async leave(@PassportUser('user_id') user_id: string, @Body() dto: UserLeaveDto): Promise<void> {
        return this.userService.leave(user_id, dto);
    }

    /**
     * 회원 탈퇴 철회 (LEAVE_WAIT → 직전 상태 복원)
     */
    @Patch('/leave')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(204)
    @ApiOperation({summary: '회원 탈퇴 철회'})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async cancelLeave(@PassportUser('user_id') user_id: string): Promise<void> {
        return this.userService.cancelLeave(user_id);
    }

    /**
     * 비밀번호 변경 (로그인 회원 공용)
     */
    @Patch('/password')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(204)
    @ApiOperation({summary: '비밀번호 변경'})
    @ApiBody({type: UserPasswordDto})
    @ApiNoContentResponse()
    @ApiBadRequestResponse({type: ApiBadRequestResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changePassword(@PassportUser('user_id') user_id: string, @Body() dto: UserPasswordDto): Promise<void> {
        return this.userService.changePassword(user_id, dto);
    }
}
