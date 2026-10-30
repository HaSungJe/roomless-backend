import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {storeApprovedText} from '../store.util.js';
import {
    ADMIN_ACTOR,
    APPLICATION_ID,
    applicationRow,
    bootCommandPath,
    createSmsSenderMock,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    runCommand,
    SmsSenderMock,
    StoreRepositoryMock,
} from './store.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));

const PAYLOAD = {store_application_id: APPLICATION_ID};

describe('admin.store.application-approve — 입점 승인 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        sms = createSmsSenderMock();
        repo.findApplication.mockResolvedValue(applicationRow());
        repo.countStoreFiles.mockResolvedValue(1);
        repo.findApplicant.mockResolvedValue({user_id: 'u'.repeat(32), gender: 'F', birth: '1990-01-01'});
        ({dispatcher, module} = await bootCommandPath(repo, createStorageGatewayMock(), sms));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체(활성 · 영업준비 · 업체코드) → 업체 상품 설정 3행 → 파일을 업체로 → 업체 총관리자(신청 때 정한 아이디 · 비밀번호) → 신청 승인(대기 조건) → 승인 알림 SMS(마지막)', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_APPROVE, payload: PAYLOAD, actor: ADMIN_ACTOR});

            // 업체
            expect(repo.countStoreFiles).toHaveBeenCalledWith({store_application_id: APPLICATION_ID, store_file_purpose_id: 'BUSINESS_LICENSE'});
            const store = repo.insertStore.mock.calls[0][0] as StoreEntity;
            expect(store).toBeInstanceOf(StoreEntity);
            expect(store.store_id).toMatch(/^[a-f0-9]{32}$/);
            expect(store.store_code).toMatch(/^[a-f0-9]{32}$/);
            expect(store.store_code).not.toBe(store.store_id);
            expect(store).toMatchObject({
                store_state_id: 'ACTIVE',
                store_name: '룸리스 강남점',
                business_number: '1234567890',
                owner_name: '홍길동',
                phone: '0212345678',
                address_detail: null,
                latitude: 37.4979,
                longitude: 127.0276,
                introduction: null,
                is_always_open: 0,
                is_open: 0,
                maintenance_minutes: 0,
                booking_open_hours: 72,
                refund_deadline_hours: 1,
                suspend_comment: null,
                is_deleted: 0,
                delete_backup: null,
            });
            expect(store).not.toHaveProperty('store_detail');

            // 업체 상품 설정 — 새 업체에 상품 종류마다 1행(판매 · 매일 · 기본 이용 시간 · 입실 · 퇴실 시각)
            expect(repo.insertStorePlans).toHaveBeenCalledTimes(1);
            const plans = repo.insertStorePlans.mock.calls[0][0] as RoomPlanEntity[];
            expect(plans).toHaveLength(3);
            for (const plan of plans) {
                expect(plan).toBeInstanceOf(RoomPlanEntity);
                expect(plan.room_plan_id).toMatch(/^[a-f0-9]{32}$/);
                expect(plan).toMatchObject({store_id: store.store_id, is_used: 1, days_of_week: 127});
            }
            expect(plans.map(({room_plan_type_id, usage_hours, check_in_time, check_out_time}) => ({room_plan_type_id, usage_hours, check_in_time, check_out_time}))).toEqual([
                {room_plan_type_id: 'HOURLY', usage_hours: 3, check_in_time: null, check_out_time: null},
                {room_plan_type_id: 'NIGHT', usage_hours: null, check_in_time: '22:00', check_out_time: '09:00'},
                {room_plan_type_id: 'LONG', usage_hours: null, check_in_time: '15:00', check_out_time: '11:00'},
            ]);

            // 파일 → 업체
            expect(repo.assignStoreFiles).toHaveBeenCalledWith(APPLICATION_ID, store.store_id);

            // 업체 총관리자 — 신청의 아이디 · 해시를 그대로, 변경 필요 없음
            const manager = repo.insertHeadManager.mock.calls[0][0] as UserEntity;
            expect(manager).toBeInstanceOf(UserEntity);
            expect(manager).toMatchObject({
                auth_id: 'HEAD_MANAGER',
                login_scope: 'MANAGER',
                state_id: 'ACTIVE',
                store_id: store.store_id,
                login_id: 'owner01',
                login_pw: 'hashed-owner-password',
                name: '홍길동',
                nickname: '홍길동',
                gender: 'F',
                birth: '1990-01-01',
                phone: '01012345678',
                sns_id: null,
                is_password_change_required: 0,
            });
            expect(getBcrypt).not.toHaveBeenCalled();

            // 신청 승인 — 대기 조건
            const [where, approved] = repo.updateApplication.mock.calls[0] as [unknown, StoreApplicationEntity];
            expect(where).toEqual({store_application_id: APPLICATION_ID, store_application_state_id: 'WAIT'});
            expect(approved).toBeInstanceOf(StoreApplicationEntity);
            expect(approved).toMatchObject({store_application_state_id: 'APPROVED', store_id: store.store_id});
            expect(approved.reviewed_at).toBeInstanceOf(Date);

            // 승인 알림 SMS (마지막) — 자격증명 · 업체코드 없음
            expect(sms.send).toHaveBeenCalledWith({to: '01012345678', text: storeApprovedText('룸리스 강남점')});
            expect(storeApprovedText('룸리스 강남점')).toBe('[roomless] 룸리스 강남점 입점이 승인되었습니다.');
            expect(repo.updateApplication.mock.invocationCallOrder[0]).toBeLessThan(sms.send.mock.invocationCallOrder[0]);
            expect(result).toEqual({result: {store_id: store.store_id, store_code: store.store_code}, error: null});
        });
    });

    describe('[FAIL:service]', () => {
        it('신청이 없으면 failed 404, 업체 등록 없음', async () => {
            repo.findApplication.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_APPROVE, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '입점 신청을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.insertStore).not.toHaveBeenCalled();
            expect(repo.insertStorePlans).not.toHaveBeenCalled();
        });

        it.each([
            ['반려 신청', () => repo.findApplication.mockResolvedValueOnce(applicationRow({store_application_state_id: 'REJECTED'})), '대기 중인 입점 신청만 처리할 수 있습니다.'],
            ['사업자등록증 없음', () => repo.countStoreFiles.mockResolvedValueOnce(0), '사업자등록증 사진이 없어 승인할 수 없습니다.'],
            ['신청자 계정 없음', () => repo.findApplicant.mockResolvedValueOnce(null), '신청자 정보를 찾을 수 없어 승인할 수 없습니다.'],
        ])('%s → failed 400, 업체 등록 · SMS 없음', async (_label, arrange, message) => {
            arrange();

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_APPROVE, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: null}});
            expect(repo.insertStore).not.toHaveBeenCalled();
            expect(repo.insertStorePlans).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('그 사이 취소 · 반려돼 승인 수정이 0건이면 failed 400(롤백), SMS 없음', async () => {
            repo.updateApplication.mockResolvedValueOnce(false);

            const {decision, result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_APPROVE, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: '대기 중인 입점 신청만 처리할 수 있습니다.', validation_errors: null}});
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('사업자번호 UK 충돌(repository 400)은 그대로 failed 400, 업체 상품 설정 · 파일 · 계정 처리 없음', async () => {
            repo.insertStore.mockRejectedValueOnce(new BadRequestException({message: '이미 신청 · 등록된 사업자등록번호입니다.'}));

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_APPROVE, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 신청 · 등록된 사업자등록번호입니다.', validation_errors: null}});
            expect(repo.insertStorePlans).not.toHaveBeenCalled();
            expect(repo.assignStoreFiles).not.toHaveBeenCalled();
            expect(repo.insertHeadManager).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:infra]', () => {
        it('SMS 503 은 재시도(requeue) — 마지막 전달이면 dead + failed 503', async () => {
            sms.send.mockRejectedValue(new ServiceUnavailableException({message: 'SMS 발송을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const first = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_APPROVE, payload: PAYLOAD, actor: ADMIN_ACTOR});
            const last = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_APPROVE, payload: PAYLOAD, actor: ADMIN_ACTOR, delivery_count: 3});

            expect(first.decision.action).toBe('requeue');
            expect(last.decision.action).toBe('dead');
            expect(last.result?.error?.status_code).toBe(503);
        });
    });
});
