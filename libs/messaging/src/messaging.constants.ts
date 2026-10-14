/** 명령 exchange — 게이트웨이가 발행, 서비스 명령 큐가 `<server>.#` 로 바인딩 */
export const COMMAND_EXCHANGE = 'roomless.cmd';

/** 이벤트 exchange — 결과 회신(`result.<게이트웨이>.#`)과 도메인 이벤트(알림 서버용)가 흐른다 */
export const EVENT_EXCHANGE = 'roomless.event';

/** dead-letter exchange — 처리 불가 · 재시도 소진 명령이 모인다 */
export const DEAD_LETTER_EXCHANGE = 'roomless.dlx';

/** dead-letter 큐 — 운영자가 확인 · 재처리한다 */
export const DEAD_LETTER_QUEUE = 'q.dead';

/**
 * 인프라 오류(5xx)로 실패한 명령의 최대 재전달 횟수.
 * 명령 큐의 `x-delivery-limit` 과 같은 값이며, 마지막 시도에서도 실패하면 failed 결과를 회신하고 DLQ 로 보낸다.
 */
export const MAX_REDELIVERY = 3;

/** 서비스 명령 큐 기본 prefetch */
export const DEFAULT_PREFETCH = 10;

/** 결과 회신 라우팅 키 접두 — `result.<게이트웨이 인스턴스>.<명령 type>.<done|failed>` */
export const RESULT_ROUTING_PREFIX = 'result';

/** 브로커 연결이 없을 때 게이트웨이가 돌려주는 메시지 */
export const BROKER_UNAVAILABLE_MESSAGE = '일시적으로 요청을 접수할 수 없습니다. 잠시 후 다시 시도해주세요.';

/**
 * 브로커 계정 — 앱마다 다른 계정으로 접속한다. 권한은 docker/rabbitmq/init.sh 가 부여한다.
 * - gateway: roomless.cmd 에만 쓸 수 있다(명령 발행). roomless.event 에는 쓸 수 없다.
 * - user-service: roomless.event 에만 쓸 수 있다(결과 회신). roomless.cmd 에는 쓸 수 없다.
 */
export const BROKER_USER = {GATEWAY: 'gateway', USER_SERVICE: 'user-service'} as const;

/** 명령을 발행할 수 있는 유일한 계정 — 서비스는 user_id 가 이 값인 명령만 처리한다 */
export const COMMAND_PUBLISHER_USER = BROKER_USER.GATEWAY;
