#!/bin/sh
# RabbitMQ 계정 · 권한 초기화 (docker compose 의 rabbitmq-init 이 1회 실행, 여러 번 실행해도 같은 결과)
#
# 앱마다 다른 계정을 쓰고, 명령 exchange(roomless.cmd)에 쓸 수 있는 계정은 gateway 하나뿐이다.
#   gateway      : roomless.cmd 발행 O, roomless.event 발행 X  — 자기 결과 큐(q.gw.result.*)만 선언 · 소비
#   user-service : roomless.event 발행 O, roomless.cmd 발행 X — q.user.cmd 만 선언 · 소비
# 공통 토폴로지(roomless.cmd · roomless.event · roomless.dlx · q.dead)는 두 앱이 접속할 때 선언하므로 둘 다 configure 를 갖는다.
# 서비스는 추가로 메시지 user_id 가 gateway 인 명령만 처리한다(브로커가 user_id 를 접속 계정과 대조한다).
#
# 권한 기준 (https://www.rabbitmq.com/docs/access-control)
#   exchange.declare: configure(exchange) · queue.declare(+DLX): configure(queue) write(DLX) read(queue)
#   queue.bind: write(queue) read(exchange) · basic.publish: write(exchange) · basic.consume: read(queue)
#
# 비밀번호에는 큰따옴표 · 역슬래시를 쓰지 않는다(JSON 으로 그대로 넣는다).
set -eu

API="${RABBITMQ_API:-http://rabbitmq:15672/api}"
AUTH="${RABBITMQ_ADMIN_USER}:${RABBITMQ_ADMIN_PASSWORD}"

# PUT 요청 — 관리 API 가 늦게 뜰 수 있어 재시도한다.
put() {
    curl -fsS --retry 15 --retry-connrefused --retry-delay 2 -u "$AUTH" -H 'content-type: application/json' -X PUT "$API/$1" -d "$2" > /dev/null
}

echo "[rabbitmq-init] 계정 생성"
put "users/gateway" "{\"password\":\"${RABBITMQ_GATEWAY_PASSWORD}\",\"tags\":\"\"}"
put "users/user-service" "{\"password\":\"${RABBITMQ_USER_SERVICE_PASSWORD}\",\"tags\":\"\"}"

echo "[rabbitmq-init] 권한 부여 (vhost /)"
put "permissions/%2F/gateway" '{"configure":"^(roomless\\.(cmd|event|dlx)|q\\.dead|q\\.gw\\.result\\..+)$","write":"^(roomless\\.cmd|q\\.dead|q\\.gw\\.result\\..+)$","read":"^(roomless\\.(event|dlx)|q\\.gw\\.result\\..+)$"}'
put "permissions/%2F/user-service" '{"configure":"^(roomless\\.(cmd|event|dlx)|q\\.dead|q\\.user\\.cmd)$","write":"^(roomless\\.(event|dlx)|q\\.dead|q\\.user\\.cmd)$","read":"^(roomless\\.(cmd|dlx)|q\\.user\\.cmd)$"}'

echo "[rabbitmq-init] 완료"
