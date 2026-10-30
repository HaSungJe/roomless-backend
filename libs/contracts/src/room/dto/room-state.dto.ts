import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 상태 변경 path param — 내 업체의 지워지지 않은 호실만(아니면 404)
 */
export class RoomStateParamDto {
    @ApiProperty({description: '호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 호실 상태 변경 — 업체 관리자는 정비 완료(정비중 → 예약가능) · 사용중지(예약가능 · 정비중 → 사용중지) · 사용 재개(사용중지 → 예약가능)만 바꾼다. 그 밖의 전환은 400
 */
export class RoomStateDto {
    @ApiProperty({description: '바꿀 상태 (AVAILABLE: 예약가능 — 정비 완료 · 사용 재개, DISABLED: 사용중지)', enum: ['AVAILABLE', 'DISABLED']})
    @IsIn(['AVAILABLE', 'DISABLED'], {message: '바꿀 수 있는 호실 상태가 아닙니다.'})
    @IsNotEmpty({message: '호실 상태를 입력해주세요.'})
    room_state_id: string;
}
