import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, Max, Min} from 'class-validator';

/**
 * 내 업체 정비시간 설정 — 퇴실 후 다음 이용까지 호실을 막는 분
 */
export class StoreMineMaintenanceDto {
    @ApiProperty({description: '정비시간(분, 0 ~ 240)'})
    @IsInt({message: '정비시간은 분 단위 정수로 입력해주세요.'})
    @Min(0, {message: '정비시간은 0 ~ 240분 사이로 입력해주세요.'})
    @Max(240, {message: '정비시간은 0 ~ 240분 사이로 입력해주세요.'})
    @IsNotEmpty({message: '정비시간을 입력해주세요.'})
    maintenance_minutes: number;
}
