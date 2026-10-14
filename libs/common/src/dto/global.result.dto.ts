import {ApiProperty} from '@nestjs/swagger';

/**
 * 유효성검사 오류 1건 (실패 본문 `validation_errors` 의 항목)
 */
export class ValidationErrorResultDto {
    @ApiProperty({description: '유효성검사 반려 대상 필드'})
    property: string;

    @ApiProperty({description: '유효성검사 반려 메시지'})
    message: string;
}

/**
 * 모든 실패의 본문 — 400·401·403·404·500 공통.
 *
 * 전송 계층과 무관하다. 같은 객체가
 * - HTTP 경로에서는 응답 본문으로(`CustomErrorFilter`),
 * - RabbitMQ 경로에서는 failed 결과 이벤트의 본문으로(게이트웨이가 그대로 SSE `failed` 이벤트에 실음)
 * 나간다. 그래서 클라이언트는 요청이 어느 경로를 탔는지와 무관하게 같은 모양의 실패를 받는다.
 * 기능별 추가 필드(예: 정지 계정 로그인의 `block_comment`)는 이 두 필드 옆에 그대로 실린다.
 */
export class ApiFailResultDto {
    @ApiProperty({description: '메시지'})
    message: string;

    @ApiProperty({description: '입력 필드 오류 목록 (입력 필드 귀속 오류가 아니면 null)', type: () => ValidationErrorResultDto, isArray: true, nullable: true})
    validation_errors: ValidationErrorResultDto[] | null;
}

/**
 * 전송 계층과 무관한 실패 결과 — 상태 코드 + 본문.
 * 인바운드 어댑터(HTTP 필터 · RabbitMQ 핸들러)가 `toFailResult()` 로 만들어 각자의 형식으로 내보낸다.
 */
export interface FailResult {
    status_code: number;
    body: ApiFailResultDto;
}
