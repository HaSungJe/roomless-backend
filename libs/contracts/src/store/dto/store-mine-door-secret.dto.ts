import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 문 소켓 시크릿 코드 — 업체 총관리자만. bcrypt 해시로 저장하고 원문은 돌려주지 않는다(잊으면 새로 정한다).
 * 바꿔도 이미 붙어 있는 소켓은 끊지 않는다 — 다음 접속부터 새 코드
 */
export class StoreMineDoorSecretDto {
    @ApiProperty({description: '시크릿 코드 (영문 · 숫자 16 ~ 64자 — 문 쪽 프로그램이 소켓 접속 헤더 x-store-secret 으로 보낸다)'})
    @Matches(/^[A-Za-z0-9]{16,64}$/, {message: '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'})
    @IsNotEmpty({message: '시크릿 코드를 입력해주세요.'})
    door_secret: string;
}
