import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {ReservationUseCancelRequestDto, ReservationUseCancelRequestParamDto} from '@app/contracts/reservation/dto/reservation-use-cancel-request.dto.js';
import {RESERVATION_MANAGER_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {ReservationCancelRequestEntity} from '@app/database/entities/reservation/reservation-cancel-request.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createReservationRepositoryMock,
    createSmsSenderMock,
    MANAGER_ACTOR,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    runCommand,
    SmsSenderMock,
    STORE_ID,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID, cancel_reason: '배관 누수로 객실을 쓸 수 없습니다'};

/** 이용자 화면 주소 */
const USER_WEB_URL = 'https://roomless.test';

/** 이용 중 예약 — 2026-11-10 12:00 ~ 15:00(한국 시각) */
const IN_USE = {reservation_state_id: 'CHECKED_IN', start_at: new Date('2026-11-10T03:00:00Z'), end_at: new Date('2026-11-10T06:00:00Z')};

/** 32자 ID 형식 */
const ID_PATTERN = /^[a-f0-9]{32}$/;

/** 이용 중이 아닌 예약 메시지 */
const NOT_IN_USE = '이용 중인 예약만 이용자 동의 취소를 요청할 수 있습니다.';

describe('admin.reservation.use-cancel-request — 이용 중 취소 요청 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;
    const original = process.env.USER_WEB_URL;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-10T04:00:00Z'));
        process.env.USER_WEB_URL = USER_WEB_URL;
        repo = createReservationRepositoryMock();
        repo.findReservation.mockResolvedValue(reservationEntity(IN_USE));
        sms = createSmsSenderMock();
        ({dispatcher, module} = await bootCommandPath(repo, sms));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        process.env.USER_WEB_URL = original;
        await module.close();
    });

    /**
     * 이용 중 취소 요청 명령 1건
     *
     * @param actor 로그인 매니저(없으면 null)
     * @returns 판정 · 결과
     */
    function runRequest(actor: typeof MANAGER_ACTOR | null = MANAGER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_MANAGER_COMMAND.USE_CANCEL_REQUEST, payload: PAYLOAD, actor});
    }

    /**
     * [CASES:cancel-request] 만료 — min(요청 + 10분, 예약 끝)(사용자 확정 2026-11-07). 예약 끝 15:00(한국 시각).
     * [이름, 요청 시각(지금), 만료]
     */
    describe('[CASES:cancel-request] 만료 시각', () => {
        it.each([
            ['요청 13:00 · 예약 끝 15:00 → 만료 13:10', '2026-11-10T04:00:00Z', '2026-11-10T04:10:00.000Z'],
            ['요청 14:55 · 끝 15:00 → 만료 15:00(끝이 먼저)', '2026-11-10T05:55:00Z', '2026-11-10T06:00:00.000Z'],
            ['요청 14:50 · 끝 15:00 → 만료 15:00(같음)', '2026-11-10T05:50:00Z', '2026-11-10T06:00:00.000Z'],
        ])('%s', async (_label, now, expires_at) => {
            vi.setSystemTime(new Date(now));

            const {result} = await runRequest();

            const [request] = repo.insertCancelRequest.mock.calls[0] as [ReservationCancelRequestEntity];
            expect(request.expires_at).toEqual(new Date(expires_at));
            expect(result?.result).toEqual({reservation_cancel_request_id: request.reservation_cancel_request_id, expires_at});
        });
    });

    describe('[SUCCESS]', () => {
        it('이전 요청 중 → 만료, 새 요청(요청 중 · 사유 · 요청한 매니저), 예약자에게 승인 링크 SMS(마지막)', async () => {
            const {decision, result} = await runRequest();

            expect(decision.action).toBe('ack');
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, store_id: STORE_ID});
            expect(repo.findReservationUser).toHaveBeenCalledWith({user_id: USER_ACTOR.user_id});
            const [expireWhere, expired] = repo.expireCancelRequests.mock.calls[0] as [unknown, ReservationCancelRequestEntity];
            expect(expireWhere).toEqual({reservation_id: RESERVATION_ID, reservation_cancel_request_state_id: 'REQUESTED'});
            expect(expired).toBeInstanceOf(ReservationCancelRequestEntity);
            expect(expired.reservation_cancel_request_state_id).toBe('EXPIRED');
            expect(repo.insertCancelRequest).toHaveBeenCalledTimes(1);
            const [request] = repo.insertCancelRequest.mock.calls[0] as [ReservationCancelRequestEntity];
            expect(request).toBeInstanceOf(ReservationCancelRequestEntity);
            expect(request.reservation_cancel_request_id).toMatch(ID_PATTERN);
            expect(request).toMatchObject({
                reservation_id: RESERVATION_ID,
                user_id: MANAGER_ACTOR.user_id,
                reservation_cancel_request_state_id: 'REQUESTED',
                cancel_reason: '배관 누수로 객실을 쓸 수 없습니다',
                expires_at: new Date('2026-11-10T04:10:00Z'),
                responded_at: null,
            });
            expect(repo.insertCancelRequest.mock.invocationCallOrder[0]).toBeGreaterThan(repo.expireCancelRequests.mock.invocationCallOrder[0]);
            expect(sms.send).toHaveBeenCalledTimes(1);
            expect(sms.send).toHaveBeenCalledWith({
                to: '01012345678',
                text: `[roomless] 루미 강남점에서 이용 중인 예약 취소를 요청했습니다(전액 환불). 동의하려면 10분 안에 확인해주세요: https://roomless.test/reservation/${RESERVATION_ID}/cancel-request`,
            });
            expect(sms.send.mock.invocationCallOrder[0]).toBeGreaterThan(repo.insertCancelRequest.mock.invocationCallOrder[0]);
            expect(result?.result).toEqual({reservation_cancel_request_id: request.reservation_cancel_request_id, expires_at: '2026-11-10T04:10:00.000Z'});
            expect(repo.updateReservation).not.toHaveBeenCalled();
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });

        it('확정 예약(scheduler 가 이용 중으로 바꾸기 전)도 시작 뒤면 요청한다 · 주소 끝의 / 는 뗀다', async () => {
            process.env.USER_WEB_URL = 'https://roomless.test/';
            repo.findReservation.mockResolvedValueOnce(reservationEntity({...IN_USE, reservation_state_id: 'CONFIRMED'}));

            const {decision} = await runRequest();

            expect(decision.action).toBe('ack');
            expect(sms.send.mock.calls[0][0].text).toContain(`https://roomless.test/reservation/${RESERVATION_ID}/cancel-request`);
        });
    });

    describe('[FAIL:service]', () => {
        it('이용자 화면 주소(USER_WEB_URL)가 없으면 503(재시도), 업체 조회 · 쓰기 · SMS 없음', async () => {
            process.env.USER_WEB_URL = ' ';

            const {decision} = await runRequest();

            expect(decision.action).toBe('requeue');
            expect(repo.findManagerStore).not.toHaveBeenCalled();
            expect(repo.insertCancelRequest).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 404, 예약 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runRequest();

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findReservation).not.toHaveBeenCalled();
        });

        it('다른 업체 예약(없음)은 404, 쓰기 없음', async () => {
            repo.findReservation.mockResolvedValueOnce(null);

            const {result} = await runRequest();

            expect(result?.error).toEqual({status_code: 404, body: {message: '예약을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.insertCancelRequest).not.toHaveBeenCalled();
        });

        it.each([
            ['시작 전 확정(11:59:59)', {reservation_state_id: 'CONFIRMED'}, '2026-11-10T02:59:59Z'],
            ['끝 정각(15:00) 이용 중', {}, '2026-11-10T06:00:00Z'],
            ['이용 완료', {reservation_state_id: 'COMPLETED'}, '2026-11-10T04:00:00Z'],
            ['결제 대기', {reservation_state_id: 'PENDING'}, '2026-11-10T04:00:00Z'],
            ['취소', {reservation_state_id: 'CANCELED'}, '2026-11-10T04:00:00Z'],
        ])('%s 는 400 이용 중인 예약만, 번호 조회 · 쓰기 · SMS 없음', async (_label, override, now) => {
            vi.setSystemTime(new Date(now));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({...IN_USE, ...override}));

            const {result} = await runRequest();

            expect(result?.error).toEqual({status_code: 400, body: {message: NOT_IN_USE, validation_errors: null}});
            expect(repo.findReservationUser).not.toHaveBeenCalled();
            expect(repo.insertCancelRequest).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('예약자 휴대폰 번호가 없으면 400, 쓰기 · SMS 없음', async () => {
            repo.findReservationUser.mockResolvedValueOnce({user_id: USER_ACTOR.user_id, phone: null});

            const {result} = await runRequest();

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약자 휴대폰 번호가 없어 동의를 받을 수 없습니다.', validation_errors: null}});
            expect(repo.expireCancelRequests).not.toHaveBeenCalled();
            expect(repo.insertCancelRequest).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('[FAIL:duplicate] 겹친 요청(진행 중 요청 부분 유니크 위반)은 400 이미 진행 중인 취소 요청이 있습니다, SMS 없음', async () => {
            repo.insertCancelRequest.mockRejectedValueOnce(new BadRequestException({message: '이미 진행 중인 취소 요청이 있습니다.'}));

            const {result} = await runRequest();

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 진행 중인 취소 요청이 있습니다.', validation_errors: null}});
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('[FAIL:external] SMS 503 이면 재시도(요청 쓰기는 롤백 — 다시 돌 때 같은 결과)', async () => {
            sms.send.mockRejectedValueOnce(new ServiceUnavailableException({message: 'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runRequest();

            expect(decision.action).toBe('requeue');
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('사유가 없으면 → cancel_reason', async () => {
            await expect(validateBody(ReservationUseCancelRequestDto, {})).resolves.toEqual({
                message: '취소 사유를 입력해주세요.',
                validation_errors: [{property: 'cancel_reason', message: '취소 사유를 입력해주세요.'}],
            });
        });

        it('사유가 256자면 → cancel_reason', async () => {
            await expect(validateBody(ReservationUseCancelRequestDto, {cancel_reason: 'a'.repeat(256)})).resolves.toEqual({
                message: '취소 사유는 255자 이내로 입력해주세요.',
                validation_errors: [{property: 'cancel_reason', message: '취소 사유는 255자 이내로 입력해주세요.'}],
            });
        });

        it('예약 ID 경로가 32자 hex 가 아니면 → reservation_id', async () => {
            await expect(validateBody(ReservationUseCancelRequestParamDto, {reservation_id: 'xyz'})).resolves.toEqual({
                message: '예약 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'reservation_id', message: '예약 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runRequest(null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
