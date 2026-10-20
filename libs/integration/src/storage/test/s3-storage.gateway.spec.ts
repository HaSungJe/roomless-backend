import {InternalServerErrorException, ServiceUnavailableException} from '@nestjs/common';
import {S3StorageGateway} from '@app/integration/storage/s3-storage.gateway.js';

/** S3Client.send · getSignedUrl — 실제 AWS 에 보내지 않고 받은 명령만 기록한다 */
const {s3Send, getSignedUrl} = vi.hoisted(() => ({s3Send: vi.fn(), getSignedUrl: vi.fn()}));
vi.mock('@aws-sdk/client-s3', () => {
    /** 명령 — 생성자 입력을 그대로 보관한다 */
    class Command {
        /**
         * @param input 명령 입력
         */
        constructor(readonly input: unknown) {}
    }
    return {
        S3Client: class {
            send = s3Send;
            /**
             * @param config 클라이언트 설정 — 단언용으로 그대로 보관한다
             */
            constructor(readonly config: unknown) {}
        },
        PutObjectCommand: class PutObjectCommand extends Command {},
        HeadObjectCommand: class HeadObjectCommand extends Command {},
        DeleteObjectCommand: class DeleteObjectCommand extends Command {},
    };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({getSignedUrl}));

const UNAVAILABLE = {message: '파일 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'};
const ENV_KEYS = ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_S3_PUBLIC_URL'] as const;

/**
 * 503 예외인지와 본문을 확인한다.
 *
 * @param promise 실패해야 하는 호출
 */
async function expectUnavailable(promise: Promise<unknown>): Promise<void> {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual(UNAVAILABLE);
}

describe('S3StorageGateway — Amazon S3 파일 저장', () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const key of ENV_KEYS) {
            saved[key] = process.env[key];
        }
        process.env.AWS_REGION = 'ap-northeast-2';
        process.env.AWS_S3_BUCKET = 'roomless-test-files';
        delete process.env.AWS_S3_PUBLIC_URL;
        s3Send.mockReset();
        getSignedUrl.mockReset();
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
        vi.useRealTimers();
    });

    describe('createUploadUrl', () => {
        it('[SUCCESS] 버킷 · 키 · Content-Type 으로 PutObject 를 600초 서명하고 만료 시각을 돌려준다', async () => {
            vi.useFakeTimers({toFake: ['Date']});
            vi.setSystemTime(new Date('2026-10-20T00:00:00.000Z'));
            getSignedUrl.mockResolvedValueOnce('https://signed.example/upload');
            const gateway = new S3StorageGateway();

            const result = await gateway.createUploadUrl({key: 'store/s1/a.jpg', content_type: 'image/jpeg'});

            expect(result).toEqual({upload_url: 'https://signed.example/upload', expires_at: new Date('2026-10-20T00:10:00.000Z')});
            expect(getSignedUrl).toHaveBeenCalledTimes(1);
            const [client, command, options] = getSignedUrl.mock.calls[0];
            expect(client.send).toBe(s3Send);
            expect(command.constructor.name).toBe('PutObjectCommand');
            expect(command.input).toEqual({Bucket: 'roomless-test-files', Key: 'store/s1/a.jpg', ContentType: 'image/jpeg'});
            expect(options.expiresIn).toBe(600);
        });

        it('[SUCCESS] 클라이언트는 체크섬을 필요할 때만 계산한다 — 기본값이면 presigned 주소에 빈 본문 CRC32 가 박혀 실제 업로드가 거부된다', async () => {
            getSignedUrl.mockResolvedValueOnce('https://signed.example/upload');

            await new S3StorageGateway().createUploadUrl({key: 'store/s1/a.jpg', content_type: 'image/jpeg'});

            expect(getSignedUrl.mock.calls[0][0].config).toEqual({region: 'ap-northeast-2', requestChecksumCalculation: 'WHEN_REQUIRED'});
        });

        it('[SECURITY] Content-Type 을 서명 헤더에 넣는다 — 다른 타입(예: text/html)으로는 올릴 수 없다', async () => {
            getSignedUrl.mockResolvedValueOnce('https://signed.example/upload');

            await new S3StorageGateway().createUploadUrl({key: 'store/s1/a.jpg', content_type: 'image/jpeg'});

            expect(getSignedUrl.mock.calls[0][2]).toEqual({expiresIn: 600, signableHeaders: new Set(['content-type'])});
        });

        it('[FAIL:infra] 서명하지 못하면(자격증명 없음 등) 503', async () => {
            getSignedUrl.mockRejectedValueOnce(new Error('Could not load credentials'));

            await expectUnavailable(new S3StorageGateway().createUploadUrl({key: 'store/s1/a.jpg', content_type: 'image/jpeg'}));
        });
    });

    describe('exists', () => {
        it('[SUCCESS] HeadObject 가 성공하면 true', async () => {
            s3Send.mockResolvedValueOnce({});

            await expect(new S3StorageGateway().exists('store/s1/a.jpg')).resolves.toBe(true);

            expect(s3Send).toHaveBeenCalledTimes(1);
            expect(s3Send.mock.calls[0][0].constructor.name).toBe('HeadObjectCommand');
            expect(s3Send.mock.calls[0][0].input).toEqual({Bucket: 'roomless-test-files', Key: 'store/s1/a.jpg'});
        });

        it('[SUCCESS] 404 면 false — 올라가지 않은 파일', async () => {
            s3Send.mockRejectedValueOnce({name: 'NotFound', $metadata: {httpStatusCode: 404}});

            await expect(new S3StorageGateway().exists('store/s1/none.jpg')).resolves.toBe(false);
        });

        it('[FAIL:infra] 404 가 아닌 오류(403 권한 등)는 "없음"으로 보지 않고 503', async () => {
            s3Send.mockRejectedValueOnce({name: 'Forbidden', $metadata: {httpStatusCode: 403}});

            await expectUnavailable(new S3StorageGateway().exists('store/s1/a.jpg'));
        });
    });

    describe('remove', () => {
        it('[SUCCESS] 버킷 · 키로 DeleteObject 를 보낸다', async () => {
            s3Send.mockResolvedValueOnce({});

            await new S3StorageGateway().remove('store/s1/a.jpg');

            expect(s3Send).toHaveBeenCalledTimes(1);
            expect(s3Send.mock.calls[0][0].constructor.name).toBe('DeleteObjectCommand');
            expect(s3Send.mock.calls[0][0].input).toEqual({Bucket: 'roomless-test-files', Key: 'store/s1/a.jpg'});
        });

        it('[FAIL:infra] S3 오류면 503', async () => {
            s3Send.mockRejectedValueOnce(new Error('ServiceUnavailable'));

            await expectUnavailable(new S3StorageGateway().remove('store/s1/a.jpg'));
        });
    });

    describe('[CASES:getPublicUrl] 공개 주소', () => {
        it.each([
            ['https://cdn.example.com/', 'https://cdn.example.com/store/s1/a.jpg'],
            ['https://roomless-test-files.s3.ap-northeast-2.amazonaws.com', 'https://roomless-test-files.s3.ap-northeast-2.amazonaws.com/store/s1/a.jpg'],
        ])('AWS_S3_PUBLIC_URL %s → %s (끝의 / 는 뗀다)', (publicUrl, expected) => {
            process.env.AWS_S3_PUBLIC_URL = publicUrl;

            expect(new S3StorageGateway().getPublicUrl('store/s1/a.jpg')).toBe(expected);
        });
    });

    it('[FAIL:infra] AWS_S3_PUBLIC_URL 이 비어 있으면 설정된 공개 주소가 없다는 500 — 주소를 지어내지 않는다', () => {
        try {
            new S3StorageGateway().getPublicUrl('store/s1/a.jpg');
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(InternalServerErrorException);
            expect((error as InternalServerErrorException).getResponse()).toEqual({message: '설정된 파일 공개 주소가 없습니다. 관리자에게 문의해주세요.'});
        }
    });
});
