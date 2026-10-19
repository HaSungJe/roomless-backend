/**
 * Express 'trust proxy' 값을 환경변수 TRUST_PROXY 로 만든다.
 * 게이트웨이는 로드밸런서(nginx) 뒤에서 여러 대로 뜨므로, 요청을 보낸 주소는 nginx 다. 실제 클라이언트 IP(`@Ip()`)는
 * nginx 가 붙인 X-Forwarded-For 에서 읽어야 하고, 그 헤더를 믿을 앞단을 이 값으로 정한다.
 *
 * - 비어 있음: null — 설정하지 않는다(로컬 직접 실행). 요청을 보낸 주소를 그대로 쓴다.
 * - 정수: 믿을 앞단 프록시 수. Docker(nginx 1단)는 1.
 * - true / false
 * - 그 밖: 믿을 주소 목록(쉼표 구분, `loopback` · `uniquelocal` 같은 이름 가능) — Express 에 그대로 넘긴다.
 *
 * 앞단 프록시가 없는데 값을 주면 클라이언트가 X-Forwarded-For 로 IP 를 위조할 수 있다.
 *
 * @param value TRUST_PROXY 값
 * @returns `app.set('trust proxy', 값)` 에 넘길 값, 설정하지 않으면 null
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string | null {
    const trimmed = (value ?? '').trim();
    if (trimmed === '') return null;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    return trimmed;
}
