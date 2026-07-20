import { ApiHeader } from '@nestjs/swagger';
import { SUPPORTED_LANGUAGES } from '@root/common/language/language.constants';

/**
 * Swagger — Accept-Language 헤더 표시 데코레이터
 * 다국어 응답이 필요한 모든 컨트롤러 클래스에 적용.
 * 미전송 시 KO 기본값 적용 (LanguageInterceptor 처리).
 */
export const ApiLanguageHeader = () =>
    ApiHeader({
        name: 'Accept-Language',
        description: `응답 언어 코드 (BCP-47). 미전송 시 KO 적용.\n지원: ${SUPPORTED_LANGUAGES.join(' | ')}`,
        required: false,
        example: 'ko-KR',
    });
