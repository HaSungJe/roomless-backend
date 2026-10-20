import {PublishCommand, SNSClient} from '@aws-sdk/client-sns';
import {Injectable, Logger, OnApplicationBootstrap, ServiceUnavailableException} from '@nestjs/common';
import {SMS_UNAVAILABLE_MESSAGE} from '../integration.constants.js';
import {toE164KrPhone} from '../integration.util.js';
import type {SmsMessage, SmsSenderInterface} from '../interfaces/integration.interface.js';

/** SNS SMS 유형 — 인증번호 · 안내처럼 전달이 우선인 메시지 */
const SMS_TYPE = 'Transactional';

/**
 * SMS 발송 어댑터 — Amazon SNS `Publish`.
 * 리전은 AWS_REGION, 자격증명은 AWS SDK 기본 체인(AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY 또는 IAM 역할)이 읽는다.
 * 한국은 AWS 에 전용 발신번호가 없어 국제 경로로 나간다(수신 화면 국제발신, 한글 70자 단위 과금).
 * AWS 세팅: docs/guides/aws-setup.md
 */
@Injectable()
export class SnsSmsSender implements SmsSenderInterface, OnApplicationBootstrap {
    private readonly logger = new Logger(SnsSmsSender.name);
    private readonly client = new SNSClient({region: process.env.AWS_REGION});

    /**
     * AWS_REGION 이 비어 있으면 부팅 때 한 번 경고한다. 부팅은 막지 않고 발송 요청만 실패한다.
     */
    onApplicationBootstrap(): void {
        if (!process.env.AWS_REGION) {
            this.logger.warn('AWS_REGION 이 비어 있어 SMS 를 보낼 수 없습니다 — docs/guides/aws-setup.md');
        }
    }

    /**
     * SMS 1통을 SNS 로 보낸다.
     *
     * @param message 받는 번호 · 본문
     * @throws ServiceUnavailableException AWS 가 접수하지 못했을 때
     */
    async send(message: SmsMessage): Promise<void> {
        try {
            await this.client.send(
                new PublishCommand({PhoneNumber: toE164KrPhone(message.to), Message: message.text, MessageAttributes: {'AWS.SNS.SMS.SMSType': {DataType: 'String', StringValue: SMS_TYPE}}}),
            );
        } catch (error) {
            this.logger.error(`SMS 발송 실패: ${(error as Error)?.message ?? error}`);
            throw new ServiceUnavailableException({message: SMS_UNAVAILABLE_MESSAGE});
        }
    }
}
