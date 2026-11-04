import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 문 소켓 QR 확인 — 인증된 소켓의 업체 ID(gateway 가 붙인다) + 문 프로그램이 보낸 호실 ID · 읽은 QR. 그 업체의 지워지지 않은 호실이 아니면 404
 */
export class RoomDoorVerifyDto {
    @ApiProperty({description: '업체 ID (소켓 접속 때 확인한 값)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;

    @ApiProperty({description: 'QR 을 읽은 문의 호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;

    @ApiProperty({description: '문이 읽은 QR 정보 (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: 'QR 정보가 올바르지 않습니다.'})
    @IsNotEmpty({message: 'QR 정보를 입력해주세요.'})
    qr: string;
}

/**
 * QR 확인 결과 — 소켓의 `door.verified` data 로 그대로 보낸다. ok 면 서버가 이미 열림 + 시각으로 기록했다
 */
export class RoomDoorVerifyResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '그 호실의 현재 QR 과 같은지 (true: 문을 연다)'})
    ok: boolean;
}
