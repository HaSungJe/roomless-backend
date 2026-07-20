import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, MaxLength } from 'class-validator';
import { i18nMsg } from '@root/common/i18n/translate';

/** 회원 탈퇴 신청 입력 — 탈퇴 사유(선택). */
export class UserLeaveDto {
    @ApiProperty({description: '탈퇴 사유 (선택, 최대 255자)', required: false})
    @IsOptional()
    @MaxLength(255, {message: i18nMsg('user.dto.leave.leave_comment_max')})   // 탈퇴 사유는 최대 255자까지 입력할 수 있습니다.
    leave_comment: string;
}
