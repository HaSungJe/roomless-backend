import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 문 소켓 잠금 알림 — 인증된 소켓의 업체 ID(gateway 가 붙인다) + 문 프로그램이 보낸 호실 ID. 그 업체의 지워지지 않은 호실이 아니면 404
 */
export class DoorCloseDto {
    @ApiProperty({description: '업체 ID (소켓 접속 때 확인한 값)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;

    @ApiProperty({description: '잠긴 문의 호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 소켓 잠금 결과 — gateway 는 성공을 문 프로그램에 답하지 않는다(실패만 error)
 */
export class DoorCloseResultDto {
    @ApiProperty({description: '잠근 문의 호실 ID'})
    room_id: string;

    @ApiProperty({description: '문 상태 (close: 닫힘)', enum: ['open', 'close']})
    door_state: string;

    @ApiProperty({description: '문을 잠근 시각 — 한국 시각 yyyyMMddHHmmss'})
    door_changed_at: string;
}
