/**
 * 브로커 계정 권한 점검 — 계정마다 "허용돼야 할 발행"과 "거부돼야 할 발행"을 실제 RabbitMQ 에 시도해 결과를 대조한다.
 *
 * 실행: `npm run broker:check` (rabbitmq + rabbitmq-init 이 떠 있어야 한다 — `npm run docker:infra` 또는 `docker:up`)
 *
 * - 접속 정보는 앱과 같은 `.env` 키를 쓴다: RABBITMQ_HOST · RABBITMQ_PORT · RABBITMQ_<계정>_PASSWORD · 관리자 RABBITMQ_USER/PASSWORD.
 * - 모든 발행은 어느 큐에도 바인딩되지 않는 라우팅 키(`acl.probe`)로 보낸다. 허용된 발행도 큐에 닿지 않고 버려지므로
 *   실제 명령 · 결과가 처리되지 않는다.
 * - 거부는 브로커가 채널을 닫으며 돌려주는 코드로 판정한다: 403 = 쓰기 권한 없음, 406 = user_id 가 접속 계정과 다름.
 * - 비밀번호는 출력하지 않는다.
 *
 * 하나라도 기대와 다르면 종료 코드 1.
 */
import 'dotenv/config';
import amqp from 'amqplib';

const COMMAND_EXCHANGE = 'roomless.cmd';
const EVENT_EXCHANGE = 'roomless.event';
/** 어느 큐에도 바인딩되지 않는 라우팅 키 (명령 큐는 `user.#`, 결과 큐는 `result.<인스턴스>.#`) */
const PROBE_ROUTING_KEY = 'acl.probe';

const ALLOW = 'allow';
const ACCESS_REFUSED = 403;
const PRECONDITION_FAILED = 406;

const ADMIN_USER = process.env.RABBITMQ_USER || 'roomless';

/** 점검 대상 계정과 비밀번호 환경변수 */
const ACCOUNTS = {
    gateway: {user: 'gateway', password: process.env.RABBITMQ_GATEWAY_PASSWORD ?? ''},
    'user-service': {user: 'user-service', password: process.env.RABBITMQ_USER_SERVICE_PASSWORD ?? ''},
    admin: {user: ADMIN_USER, password: process.env.RABBITMQ_PASSWORD || 'roomless'},
};

/** 점검 항목 — expect: ALLOW 또는 브로커가 돌려줘야 할 거부 코드 */
const CASES = [
    {account: 'gateway', exchange: COMMAND_EXCHANGE, user_id: 'gateway', expect: ALLOW, label: '명령 발행'},
    {account: 'gateway', exchange: EVENT_EXCHANGE, user_id: 'gateway', expect: ACCESS_REFUSED, label: '결과 · 이벤트 발행'},
    {account: 'gateway', exchange: COMMAND_EXCHANGE, user_id: 'user-service', expect: PRECONDITION_FAILED, label: 'user_id 를 user-service 로 위조'},
    {account: 'user-service', exchange: COMMAND_EXCHANGE, user_id: 'user-service', expect: ACCESS_REFUSED, label: '명령 발행'},
    {account: 'user-service', exchange: EVENT_EXCHANGE, user_id: 'user-service', expect: ALLOW, label: '결과 회신'},
    {account: 'user-service', exchange: EVENT_EXCHANGE, user_id: 'gateway', expect: PRECONDITION_FAILED, label: 'user_id 를 gateway 로 위조'},
    {account: 'admin', exchange: COMMAND_EXCHANGE, user_id: 'gateway', expect: PRECONDITION_FAILED, label: '관리자가 user_id 를 gateway 로 위조'},
];

/**
 * 계정의 AMQP 접속 URL — 앱의 buildBrokerUrl 과 같은 규칙.
 *
 * @param account ACCOUNTS 항목
 * @returns amqp URL
 */
function brokerUrl(account) {
    const host = process.env.RABBITMQ_HOST || 'localhost';
    const port = process.env.RABBITMQ_PORT || '5672';
    return `amqp://${encodeURIComponent(account.user)}:${encodeURIComponent(account.password)}@${host}:${port}`;
}

/**
 * 판정 결과를 사람이 읽는 말로 바꾼다.
 *
 * @param outcome ALLOW 또는 거부 코드
 * @returns 설명
 */
function describe(outcome) {
    if (outcome === ALLOW) return '허용';
    if (outcome === ACCESS_REFUSED) return '거부(403 쓰기 권한 없음)';
    if (outcome === PRECONDITION_FAILED) return '거부(406 user_id 불일치)';
    if (outcome === 404) return '실패(404 exchange 없음)';
    return `실패(${outcome})`;
}

/**
 * 새 confirm 채널에서 한 번 발행하고, 브로커가 받아들였는지 · 어떤 코드로 거부했는지 돌려준다.
 * 거부되면 브로커가 채널을 닫으므로 항목마다 채널을 새로 연다.
 *
 * @param model 계정 연결
 * @param item CASES 항목
 * @returns ALLOW 또는 채널을 닫은 코드
 */
async function tryPublish(model, item) {
    const channel = await model.createConfirmChannel();
    let closedCode = null;
    channel.on('error', (error) => {
        closedCode = error.code ?? 'unknown';
    });
    const accepted = await new Promise((resolve) => {
        channel.publish(item.exchange, PROBE_ROUTING_KEY, Buffer.from('{}'), {userId: item.user_id, contentType: 'application/json'}, (error) => resolve(!error));
    });
    if (accepted) {
        await channel.close();
        return ALLOW;
    }
    return closedCode ?? 'unknown';
}

/**
 * 관리자 계정으로 exchange 2개를 앱과 같은 설정(topic · durable)으로 선언한다.
 * 앱을 한 번도 띄우지 않아 exchange 가 없을 때도 점검할 수 있게 한다(이미 있으면 아무 일도 없다).
 *
 * @param model 관리자 연결
 */
async function ensureExchanges(model) {
    const channel = await model.createChannel();
    await channel.assertExchange(COMMAND_EXCHANGE, 'topic', {durable: true});
    await channel.assertExchange(EVENT_EXCHANGE, 'topic', {durable: true});
    await channel.close();
}

/**
 * 접속 실패 원인을 설명으로 바꾼다. localhost 접속 실패는 메시지가 빈 AggregateError 라 code 로 구분한다.
 *
 * @param error amqp.connect 가 던진 오류
 * @returns 설명
 */
function connectFailureReason(error) {
    if (String(error.message).includes('ACCESS_REFUSED')) return '로그인 거부 — 계정이 없거나 비밀번호가 다름(docker compose logs rabbitmq-init 확인)';
    if (error.code === 'ECONNREFUSED') return '브로커에 연결할 수 없음 — RabbitMQ 가 떠 있는지 확인(npm run docker:infra)';
    return error.message || error.code || String(error);
}

/**
 * 계정에 접속한다. 실패하면 원인을 출력하고 null.
 *
 * @param name ACCOUNTS 키
 * @returns 연결 또는 null
 */
async function connect(name) {
    const account = ACCOUNTS[name];
    if (account.password === '') {
        console.log(`✗ ${name}: 비밀번호 환경변수가 비어 있음`);
        return null;
    }
    try {
        return await amqp.connect(brokerUrl(account), {clientProperties: {connection_name: `broker-check (${name})`}});
    } catch (error) {
        console.log(`✗ ${name}: 접속 실패 — ${connectFailureReason(error)}`);
        return null;
    }
}

/**
 * 모든 계정에 접속해 CASES 를 차례로 점검하고 요약을 출력한다.
 */
async function main() {
    const models = {};
    for (const name of Object.keys(ACCOUNTS)) models[name] = await connect(name);
    if (Object.values(models).some((model) => model === null)) {
        await Promise.all(Object.values(models).map((model) => model?.close()));
        process.exitCode = 1;
        return;
    }

    await ensureExchanges(models.admin);

    let failures = 0;
    for (const item of CASES) {
        const outcome = await tryPublish(models[item.account], item);
        const ok = outcome === item.expect;
        if (!ok) failures++;
        const who = item.account === 'admin' ? `관리자(${ADMIN_USER})` : item.account;
        console.log(`${ok ? '✓' : '✗'} ${who} → ${item.exchange}: ${item.label} — ${describe(outcome)}${ok ? '' : ` / 기대: ${describe(item.expect)}`}`);
    }

    await Promise.all(Object.values(models).map((model) => model.close()));
    console.log(failures === 0 ? '\n브로커 권한이 설계와 일치합니다.' : `\n${failures}건이 설계와 다릅니다. docker/rabbitmq/init.sh 와 rabbitmq-init 로그를 확인하세요.`);
    process.exitCode = failures === 0 ? 0 : 1;
}

await main();
