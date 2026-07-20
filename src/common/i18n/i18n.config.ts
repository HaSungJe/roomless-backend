import { existsSync } from 'fs';
import { join } from 'path';
import { AcceptLanguageResolver, I18nOptions, I18nYamlLoader } from 'nestjs-i18n';

/**
 * 언어팩 폴더 경로 해석 — 실행 환경마다 cwd 가 달라 후보를 순회한다.
 * - dev(nest start) / jest: cwd = 프로젝트 루트 → src/i18n
 * - prod(node dist/main, cwd = 배포 루트): dist 만 배포되므로 dist/i18n (build 시 copy-i18n 으로 복사됨)
 * - prod(cwd = dist 내부에서 실행): i18n
 * 존재하는 첫 경로 사용, 없으면 src/i18n 기본.
 */
function resolveI18nPath(): string {
    const candidates = [
        join(process.cwd(), 'src/i18n'),
        join(process.cwd(), 'dist/i18n'),
        join(process.cwd(), 'i18n'),
        join(__dirname, 'i18n'),
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

/**
 * BCP-47 태그 → 언어팩 폴더 매핑 (fallback)
 * - 지역 변형(en-US, ko-KR 등) → 기본 언어 폴더
 */
export const I18N_FALLBACKS: Record<string, string> = {
    'en-*': 'en',
    'ja-*': 'ja',
    'ko-*': 'ko',
};

/**
 * 지원 언어 폴더(소문자 BCP-47) — i18n/<lang> 와 1:1
 */
const SUPPORTED_I18N_LANGS = ['ko', 'en', 'ja'];

/**
 * Accept-Language 헤더 문자열 → 지원 언어코드(소문자 BCP-47) 변환.
 * - HTTP 외(WebSocket handshake) 컨텍스트에서 언어 결정용 (AcceptLanguageResolver 미동작 구간)
 * - 첫 태그만 사용. 지원 폴더 직매칭 → I18N_FALLBACKS(zh-CN 등/wildcard) → base 언어 → 미지원 시 'ko'
 */
export function resolveLang(acceptLanguage?: string | string[]): string {
    if (!acceptLanguage) return 'ko';
    const raw = Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage;
    const tag = (raw?.split(',')[0] ?? '').trim();
    if (!tag) return 'ko';
    const lower = tag.toLowerCase();

    if (SUPPORTED_I18N_LANGS.includes(lower)) return lower;

    for (const [key, value] of Object.entries(I18N_FALLBACKS)) {
        if (key.endsWith('-*')) {
            const prefix = key.slice(0, -2).toLowerCase();
            if (lower === prefix || lower.startsWith(prefix + '-')) return value;
        } else if (lower === key.toLowerCase()) {
            return value;
        }
    }

    const base = lower.split('-')[0];
    if (SUPPORTED_I18N_LANGS.includes(base)) return base;
    return 'ko';
}

/**
 * I18nModule.forRoot 옵션 — app.module / 테스트 공용
 *
 * - fallbackLanguage: 키 또는 언어 누락 시 KO 로 폴백
 * - loader: YAML (# 주석 지원) — 언어팩은 src/i18n/<lang>/<domain>/<layer>.yaml
 * - includeSubfolders: 폴더경로를 키 네임스페이스로 결합 (report/block.yaml → report.block.*)
 * - resolvers: Accept-Language 헤더 해석 (기존 LanguageInterceptor 대체)
 */
export function buildI18nOptions(): I18nOptions {
    return {
        fallbackLanguage: 'ko',
        fallbacks: I18N_FALLBACKS,
        loader: I18nYamlLoader,
        loaderOptions: {
            path: resolveI18nPath(),
            watch: false,
            includeSubfolders: true,
        },
        resolvers: [AcceptLanguageResolver],
        logging: false,
    };
}
