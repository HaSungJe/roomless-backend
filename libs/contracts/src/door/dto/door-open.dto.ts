import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 문 열기 — 문 쪽 타 업체 프로그램이 예약자 QR 화면에서 읽은 QR 정보. 같은 QR 을 가진 문이 없으면 404
 */
export class DoorOpenDto {
    @ApiProperty({description: 'QR 정보 (32자 — 예약자 QR 화면의 값)'})
    @Matches(/^[a-f0-9]{32}$/, {message: 'QR 정보가 올바르지 않습니다.'})
    @IsNotEmpty({message: 'QR 정보를 입력해주세요.'})
    qr: string;
}

/**
 * 문 열기 결과 — 연 문(호실)과 바뀐 상태 · 시각. 문 쪽 프로그램은 닫을 때 이 room_id 를 보낸다
 */
export class DoorOpenResultDto {
    @ApiProperty({description: '연 문의 호실 ID'})
    room_id: string;

    @ApiProperty({description: '문 상태 (open: 열림)', enum: ['open', 'close']})
    door_state: string;

    @ApiProperty({description: '문을 연 시각 — 한국 시각 yyyyMMddHHmmss (예: 20261101022459)'})
    door_changed_at: string;
}
