import { AsyncLocalStorage } from 'async_hooks';
import { I18nContext, I18nService } from 'nestjs-i18n';

/**
 * 부트스트랩 시점에 주입되는 I18nService 참조
 * - HTTP 컨텍스트 밖(BullMQ Worker, 스케줄러)에서도 번역 가능하게 하기 위함
 */
let i18nRef: I18nService | null = null;

/**
 * HTTP 외(BullMQ Worker) 언어 복원용 저장소
 * - Worker 는 HTTP 요청과 다른 async 컨텍스트라 I18nContext 가 없음
 * - dispatch 시점의 요청 언어를 job 으로 전달받아 worker 실행 구간에 주입
 * - translate() 가 I18nContext 부재 시 이 값을 참조
 */
export const fallbackLangStore = new AsyncLocalStorage<string>();

/**
 * 전역 I18nService 등록 (main.ts bootstrap 에서 1회 호출)
 */
export function setI18nService(service: I18nService): void {
    i18nRef = service;
}

/**
 * 언어팩 키를 현재 요청 언어 문자열로 변환
 *
 * - HTTP 요청: I18nContext.current().lang (Accept-Language 해석 결과)
 * - HTTP 외(Worker/스케줄러): lang 미지정 → I18nModule fallbackLanguage(KO)
 * - 키 자체가 존재하지 않으면(KO 조차 없음) null 반환
 *
 * @example translate('report.service.block.self_block_forbidden')
 */
export function translate(key: string): string | null {
    const lang = I18nContext.current()?.lang ?? fallbackLangStore.getStore();

    let result: string | undefined;
    if (i18nRef) {
        result = i18nRef.t(key as never, { lang });
    } else {
        // 부트스트랩 전(테스트 등)에는 컨텍스트 직접 사용
        result = I18nContext.current()?.t(key as never);
    }

    if (result == null) return null;
    // throwOnMissingKey=false 기본동작: 미해결 키는 키 문자열을 그대로 반환 → null 로 정규화
    return result === key ? null : result;
}

/**
 * class-validator `message` 옵션용 다국어 래퍼
 *
 * 데코레이터 정의 시점이 아닌 **검증 실패 시점**(ValidationPipe 실행)에 언어를 확인하므로
 * Accept-Language 헤더가 정상 반영됨. validation 은 항상 HTTP 요청 컨텍스트에서 실행됨.
 *
 * @example
 * @IsNotEmpty({ message: i18nMsg('report.block.dto.user_id_required') })
 */
export function i18nMsg(key: string): () => string {
    return () => translate(key) ?? '';
}
