/**
 * 지원 언어 목록
 * - API 헤더 Accept-Language (BCP-47) 에서 허용되는 값
 */
export const SUPPORTED_LANGUAGES = [
    'EN',       // English     +1
    'JA',       // Japanese    +81
    'KO',       // Korean      +82
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** 미전송 또는 미지원 언어 코드 수신 시 기본값 */
export const DEFAULT_LANGUAGE: Language = 'KO';
