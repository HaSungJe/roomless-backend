import {ServiceUnavailableException} from '@nestjs/common';
import {SnsSmsSender} from '@app/integration/sms/sns-sms.sender.js';

/** SNSClient.send — 실제 AWS 에 보내지 않고 받은 명령만 기록한다 */
const snsSend = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-sns', () => ({
    SNSClient: class {
        send = snsSend;
    },
    PublishCommand: class {
        /**
         * @param input 명령 입력 — 단언용으로 그대로 보관한다
         */
        constructor(readonly input: unknown) {}
    },
}));

describe('SnsSmsSender — Amazon SNS SMS 발송', () => {
    beforeEach(() => {
        snsSend.mockReset();
    });

    it('[SUCCESS] 국내 번호를 E.164 로 바꿔 Transactional SMS 로 Publish 한다', async () => {
        snsSend.mockResolvedValueOnce({MessageId: 'm-1'});

        await new SnsSmsSender().send({to: '010-1234-5678', text: '[roomless] 인증번호 123456'});

        expect(snsSend).toHaveBeenCalledTimes(1);
        expect(snsSend.mock.calls[0][0].input).toEqual({
            PhoneNumber: '+821012345678',
            Message: '[roomless] 인증번호 123456',
            MessageAttributes: {'AWS.SNS.SMS.SMSType': {DataType: 'String', StringValue: 'Transactional'}},
        });
    });

    it('[FAIL:infra] SNS 가 거부하면 503 — 큐 경로에서 재시도된다', async () => {
        snsSend.mockRejectedValueOnce(new Error('Throttling'));

        const error = await new SnsSmsSender().send({to: '01012345678', text: '본문'}).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({message: 'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.'});
        expect(snsSend).toHaveBeenCalledTimes(1);
    });
});
