import {LessThanOrEqual} from 'typeorm';
import {Test} from '@nestjs/testing';
import {UserLeaveCleanupCrontab} from '../crontabs/user-leave-cleanup.crontab.js';
import {USER_REPOSITORY} from '../user.symbols.js';
import {createUserRepositoryMock, UserRepositoryMock} from './user.test-helper.js';

const NOW = new Date(2026, 0, 15, 9, 30, 0);

describe('UserLeaveCleanupCrontab — 탈퇴 자동처리', () => {
    let repo: UserRepositoryMock;
    let crontab: UserLeaveCleanupCrontab;
    const originalEnv = process.env.NODE_ENV;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createUserRepositoryMock();
        const module = await Test.createTestingModule({providers: [UserLeaveCleanupCrontab, {provide: USER_REPOSITORY, useValue: repo}]}).compile();
        crontab = module.get(UserLeaveCleanupCrontab);
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('[SKIP] 운영 환경이 아니면 아무것도 하지 않는다', async () => {
        process.env.NODE_ENV = 'development';

        await crontab.processLeaveWait();

        expect(repo.findUsers).not.toHaveBeenCalled();
        expect(repo.updateUser).not.toHaveBeenCalled();
    });

    it('[SUCCESS] 예약시각이 지난 LEAVE_WAIT 회원을 원본 백업 후 LEAVE 로 바꾸고 PII 를 순번별로 익명화한다', async () => {
        process.env.NODE_ENV = 'production';
        const users = [
            {user_id: 'a'.repeat(32), name: '가', sns_user_id: 'k1'},
            {user_id: 'b'.repeat(32), name: '나', sns_user_id: 'k2'},
        ];
        repo.findUsers.mockResolvedValueOnce(users);

        await crontab.processLeaveWait();

        expect(repo.findUsers).toHaveBeenCalledWith({state_id: 'LEAVE_WAIT', leave_reserved_at: LessThanOrEqual('2026-01-15 09:30:00')});
        expect(repo.updateUser).toHaveBeenCalledTimes(2);
        expect(repo.updateUser).toHaveBeenNthCalledWith(
            1,
            {user_id: users[0].user_id},
            {
                state_id: 'LEAVE',
                leave_backup: JSON.stringify(users[0]),
                sns_user_id: 'DEL_202601150930_0',
                name: 'DEL_202601150930_0',
                birth: 'DEL_202601150930_0',
                phone: 'DEL_202601150930_0',
                device_os: null,
                device_token: null,
            },
        );
        expect(repo.updateUser.mock.calls[1][1].name).toBe('DEL_202601150930_1');
    });

    it('[FAIL:item] 한 건이 실패해도 다음 회원은 계속 처리한다', async () => {
        process.env.NODE_ENV = 'production';
        repo.findUsers.mockResolvedValueOnce([{user_id: 'a'.repeat(32)}, {user_id: 'b'.repeat(32)}]);
        repo.updateUser.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce(undefined);

        await expect(crontab.processLeaveWait()).resolves.toBeUndefined();

        expect(repo.updateUser).toHaveBeenCalledTimes(2);
    });
});
