import type {CorsOptions} from '@nestjs/common/interfaces/external/cors-options.interface.js';

/**
 * 게이트웨이 CORS 설정 — 허용할 브라우저 출처(프론트 주소)를 환경변수 CORS_ORIGINS 로 받는다.
 *
 * - CORS_ORIGINS: 쉼표로 구분한 출처 목록(`http://localhost:3001,https://app.roomless.kr`). `*` 이면 모든 출처 허용.
 * - 값이 없으면 다른 출처의 브라우저 요청을 모두 막는다(설정 누락으로 열려 버리는 것을 막음).
 * - CORS 는 브라우저만 지키는 규칙이다. 서버 간 호출(게이트웨이 → user-service)을 막는 수단이 아니며,
 *   user-service 는 내부 토큰 · Docker 내부 네트워크로 게이트웨이만 닿게 한다.
 * - 인증은 Authorization 헤더(JWT)라 쿠키 자격증명은 허용하지 않는다.
 *
 * @param env 환경변수 (테스트 주입용)
 * @returns Nest enableCors 옵션
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
    const origins = (env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
    return {
        origin: origins.length === 0 ? false : origins.includes('*') ? '*' : origins,
        allowedHeaders: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 204,
    };
}
