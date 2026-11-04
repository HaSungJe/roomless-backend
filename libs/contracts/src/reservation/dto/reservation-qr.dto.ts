import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 예약 QR path — 내 예약만(남의 예약은 404)
 */
export class ReservationQrParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 내 예약 QR — 이용 시간에만 볼 수 있고, 유효 끝(이용 끝)이 지나면 그 QR 로는 열리지 않는다
 */
export class ReservationQrResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: 'QR 정보 (32자 — 화면에 QR 로 그려 문에 댄다)'})
    qr: string;

    @ApiProperty({description: 'QR 유효 시작 (ISO 8601 — 이용 시작)'})
    qr_starts_at: string;

    @ApiProperty({description: 'QR 유효 끝 (ISO 8601 — 이용 끝, 이 시각부터 쓸 수 없다)'})
    qr_ends_at: string;
}
