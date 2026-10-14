/** 명령 발행 포트 (게이트웨이) — 구현: RabbitMqCommandPublisher */
export const COMMAND_PUBLISHER = Symbol('CommandPublisherInterface');

/** 결과 수신 포트 (게이트웨이) — 구현: RabbitMqResultSubscriber */
export const RESULT_SUBSCRIBER = Symbol('ResultSubscriberInterface');

/** 이 게이트웨이 인스턴스의 ID — 명령의 meta.reply_to 와 결과 큐 이름에 쓴다 */
export const GATEWAY_INSTANCE_ID = Symbol('GatewayInstanceId');

/** 서비스 명령 소비 설정 */
export const COMMAND_CONSUMER_OPTIONS = Symbol('CommandConsumerOptions');

/** 이 앱이 브로커에 접속하는 계정 (BROKER_USER 값) — 발행 메시지의 user_id 가 된다 */
export const BROKER_ACCOUNT = Symbol('BrokerAccount');
