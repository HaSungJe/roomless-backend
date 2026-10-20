import {DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {Injectable, InternalServerErrorException, Logger, OnApplicationBootstrap, ServiceUnavailableException} from '@nestjs/common';
import {STORAGE_PUBLIC_URL_MISSING_MESSAGE, STORAGE_UNAVAILABLE_MESSAGE, STORAGE_UPLOAD_URL_TTL_SECONDS} from '../integration.constants.js';
import type {StorageGatewayInterface, StorageUploadInput, StorageUploadResult} from '../interfaces/integration.interface.js';

/**
 * 파일 저장소 어댑터 — Amazon S3. 업로드는 presigned URL(PutObject, Content-Type 서명)로 클라이언트가 직접 한다.
 * 버킷 AWS_S3_BUCKET, 공개 주소 기준 AWS_S3_PUBLIC_URL, 리전 AWS_REGION, 자격증명은 AWS SDK 기본 체인.
 * AWS 세팅: docs/guides/aws-setup.md
 */
@Injectable()
export class S3StorageGateway implements StorageGatewayInterface, OnApplicationBootstrap {
    private readonly logger = new Logger(S3StorageGateway.name);
    /** 체크섬은 필요할 때만 — SDK 기본값(WHEN_SUPPORTED)이면 presigned PutObject 주소에 빈 본문의 CRC32 가 박혀 실제 파일 업로드를 S3 가 거부한다 */
    private readonly client = new S3Client({region: process.env.AWS_REGION, requestChecksumCalculation: 'WHEN_REQUIRED'});

    /**
     * AWS_REGION · AWS_S3_BUCKET · AWS_S3_PUBLIC_URL 중 비어 있는 값이 있으면 부팅 때 한 번 경고한다. 부팅은 막지 않고 파일 요청만 실패한다.
     */
    onApplicationBootstrap(): void {
        if (!process.env.AWS_REGION || !process.env.AWS_S3_BUCKET || !process.env.AWS_S3_PUBLIC_URL) {
            this.logger.warn('AWS_REGION · AWS_S3_BUCKET · AWS_S3_PUBLIC_URL 중 비어 있는 값이 있어 파일 요청은 실패합니다 — docs/guides/aws-setup.md');
        }
    }

    /**
     * 키 하나에 쓸 업로드 주소를 서명한다(네트워크 호출 없음).
     * Content-Type 을 서명 헤더에 넣어, 클라이언트는 같은 Content-Type 헤더로만 올릴 수 있다.
     *
     * @param input 저장 키 · MIME 타입
     * @returns 업로드 주소 · 만료 시각
     * @throws ServiceUnavailableException 서명하지 못했을 때(자격증명 · 버킷 설정 없음)
     */
    async createUploadUrl(input: StorageUploadInput): Promise<StorageUploadResult> {
        try {
            const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({Bucket: process.env.AWS_S3_BUCKET, Key: input.key, ContentType: input.content_type}), {
                expiresIn: STORAGE_UPLOAD_URL_TTL_SECONDS,
                signableHeaders: new Set(['content-type']),
            });
            return {upload_url: uploadUrl, expires_at: new Date(Date.now() + STORAGE_UPLOAD_URL_TTL_SECONDS * 1000)};
        } catch (error) {
            throw toUnavailable(this.logger, '업로드 주소 발급', error);
        }
    }

    /**
     * HeadObject 로 업로드 여부를 확인한다 — 404 면 false.
     *
     * @param key 저장 키
     * @returns 올라가 있으면 true
     * @throws ServiceUnavailableException 404 가 아닌 오류
     */
    async exists(key: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({Bucket: process.env.AWS_S3_BUCKET, Key: key}));
            return true;
        } catch (error) {
            if (isNotFound(error)) {
                return false;
            }
            throw toUnavailable(this.logger, '파일 확인', error);
        }
    }

    /**
     * 공개 주소 — AWS_S3_PUBLIC_URL(끝의 / 는 뗀다) 뒤에 키.
     *
     * @param key 저장 키
     * @returns 공개 주소
     * @throws InternalServerErrorException AWS_S3_PUBLIC_URL 이 비어 있을 때 — 설정된 공개 주소가 없다
     */
    getPublicUrl(key: string): string {
        const base = (process.env.AWS_S3_PUBLIC_URL ?? '').replace(/\/+$/, '');
        if (!base) {
            this.logger.error('AWS_S3_PUBLIC_URL 이 비어 있어 파일 공개 주소를 만들 수 없습니다 — docs/guides/aws-setup.md');
            throw new InternalServerErrorException({message: STORAGE_PUBLIC_URL_MISSING_MESSAGE});
        }
        return `${base}/${key}`;
    }

    /**
     * 파일을 지운다 — S3 는 없는 키도 성공으로 답한다.
     *
     * @param key 저장 키
     * @throws ServiceUnavailableException 저장소에 닿지 못했을 때
     */
    async remove(key: string): Promise<void> {
        try {
            await this.client.send(new DeleteObjectCommand({Bucket: process.env.AWS_S3_BUCKET, Key: key}));
        } catch (error) {
            throw toUnavailable(this.logger, '파일 삭제', error);
        }
    }
}

/**
 * S3 의 404 응답인지 — HeadObject 는 본문이 없어 상태 코드로만 알 수 있다.
 * (IAM 에 s3:ListBucket 이 없으면 없는 키도 403 으로 와서 503 이 된다 — 가이드의 IAM 정책 참고)
 *
 * @param error SDK 오류
 * @returns 404 면 true
 */
function isNotFound(error: unknown): boolean {
    return (error as {$metadata?: {httpStatusCode?: number}})?.$metadata?.httpStatusCode === 404;
}

/**
 * S3 오류를 로그로 남기고 503 으로 바꾼다.
 *
 * @param logger 어댑터 로거
 * @param action 실패한 작업
 * @param error SDK 오류
 * @returns 던질 예외
 */
function toUnavailable(logger: Logger, action: string, error: unknown): ServiceUnavailableException {
    logger.error(`S3 ${action} 실패: ${(error as Error)?.message ?? error}`);
    return new ServiceUnavailableException({message: STORAGE_UNAVAILABLE_MESSAGE});
}
