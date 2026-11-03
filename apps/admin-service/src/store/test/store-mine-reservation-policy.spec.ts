import type {TestingModule} from '@nestjs/testing';
import {StoreMineReservationPolicyDto} from '@app/contracts/store/dto/store-mine-reservation-policy.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createStoreRepositoryMock, MANAGER_ACTOR, runCommand, STORE_ID, StoreRepositoryMock, storeRow, validateBody} from './store.test-helper.js';

const PAYLOAD = {booking_open_hours: 24, refund_deadline_minutes: 90, late_refund_percent: 30};

describe('admin.store.mine-reservation-policy — 내 업체 예약 · 환불 규정 설정 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 행을 잠가 찾고 예약 가능 시작 · 환불 마감(분) · 마감 뒤 환불 비율만 바꾼다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_RESERVATION_POLICY, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.updateStore).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity).toEqual(Object.assign(new StoreEntity(), {booking_open_hours: 24, refund_deadline_minutes: 90, late_refund_percent: 30}));
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 failed 404, 수정 없음', async () => {
            repo.findStoreByManager.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_RESERVATION_POLICY, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['예약 가능 시간 0', {...PAYLOAD, booking_open_hours: 0}, 'booking_open_hours', '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'],
            ['예약 가능 시간 4,321', {...PAYLOAD, booking_open_hours: 4321}, 'booking_open_hours', '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'],
            ['환불 마감 10,081분', {...PAYLOAD, refund_deadline_minutes: 10081}, 'refund_deadline_minutes', '환불 마감은 0 ~ 10,080분 사이로 입력해주세요.'],
            ['마감 뒤 환불 비율 101%', {...PAYLOAD, late_refund_percent: 101}, 'late_refund_percent', '마감 뒤 환불 비율은 0 ~ 100% 사이로 입력해주세요.'],
            ['마감 뒤 환불 비율 없음', {booking_open_hours: 24, refund_deadline_minutes: 90}, 'late_refund_percent', '마감 뒤 환불 비율을 입력해주세요.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(StoreMineReservationPolicyDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it.each([
            [1, 0, 0],
            [4320, 10080, 100],
        ])('경계 예약 %s · 환불 마감 %s · 비율 %s 는 통과한다', async (booking_open_hours, refund_deadline_minutes, late_refund_percent) => {
            await expect(validateBody(StoreMineReservationPolicyDto, {booking_open_hours, refund_deadline_minutes, late_refund_percent})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_RESERVATION_POLICY, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findStoreByManager).not.toHaveBeenCalled();
        });
    });
});
