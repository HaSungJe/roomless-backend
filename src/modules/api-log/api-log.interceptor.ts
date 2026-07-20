import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { ApiLogEntity } from './api-log.entity';
import type { ApiLogRepositoryInterface } from './api-log.repository.interface';
import { API_LOG_REPOSITORY } from './api-log.symbols';

/**
 * 글로벌 인터셉터 — 모든 HTTP 요청에 대해 API 로그를 자동 저장.
 *
 * 동작:
 * 1. 요청 시작 시 startTime 기록 + res.send 를 monkey-patch 하여 응답 body 캡처
 * 2. res.on('finish') 시점(응답 클라이언트 전송 완료)에 status/body/duration 확정
 * 3. ApiLogRepository 로 비차단(fire-and-forget) 저장 — 응답 속도에 영향 없음
 *
 * 성공/실패 모두 동일 경로로 처리. ExceptionFilter 별도 불필요.
 */
@Injectable()
export class ApiLogInterceptor implements NestInterceptor {
    constructor(
        @Inject(API_LOG_REPOSITORY)
        private readonly apiLogRepository: ApiLogRepositoryInterface,
    ) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        // HTTP 컨텍스트 외(예: WebSocket, RPC)는 스킵
        if (context.getType() !== 'http') {
            return next.handle();
        }

        const http = context.switchToHttp();
        const req = http.getRequest<Request>();
        const res = http.getResponse<Response>();
        const startTime = Date.now();

        // 라우트 패턴 추출 — `/api/v1/user/admin/:user_id/password` 형태로 저장하기 위함.
        // 실제 ID 값은 entity.request_param 으로 별도 저장되므로 path 는 그룹화·통계에 유리한 패턴 형태로.
        const routePath = this.extractRoutePath(context);

        // 응답 body 캡처 — res.send 가 NestJS 의 모든 응답(json/text/buffer) 의 최종 통로
        let capturedBody: any = undefined;
        const originalSend = res.send.bind(res);
        res.send = (body: any) => {
            capturedBody = body;
            return originalSend(body);
        };

        // 응답 완료 시점에 로그 저장 (한 번만)
        let saved = false;
        const saveLog = () => {
            if (saved) return;
            saved = true;

            const entity = this.buildLogEntity(req, res, capturedBody, startTime, routePath);
            // 비차단 저장 — 실패해도 요청 응답에 영향 주지 않음
            this.apiLogRepository.insert(entity).catch((err) => {
                console.error('[ApiLogInterceptor] insert failed:', err?.message ?? err);
            });
        };
        res.on('finish', saveLog);
        res.on('close', saveLog); // 클라이언트가 중도 끊은 경우 대비

        return next.handle();
    }

    /**
     * NestJS 의 컨트롤러/핸들러 메타데이터에서 라우트 패턴을 조립.
     * 예: `@Controller('/api/v1/user')` + `@Patch('/admin/:user_id/password')` → `/api/v1/user/admin/:user_id/password`
     * 추출 실패 시 null 반환 → 호출 측에서 originalUrl 로 fallback.
     */
    private extractRoutePath(context: ExecutionContext): string | null {
        try {
            const handler = context.getHandler();
            const controller = context.getClass();
            if (!handler || !controller) return null;

            const handlerMeta = Reflect.getMetadata(PATH_METADATA, handler);
            const controllerMeta = Reflect.getMetadata(PATH_METADATA, controller);

            const c = Array.isArray(controllerMeta) ? (controllerMeta[0] ?? '') : (controllerMeta ?? '');
            const h = Array.isArray(handlerMeta) ? (handlerMeta[0] ?? '') : (handlerMeta ?? '');
            if (!c && !h) return null;

            const combined = `/${c}/${h}`.replace(/\/+/g, '/');
            return combined.length > 1 && combined.endsWith('/') ? combined.slice(0, -1) : combined;
        } catch {
            return null;
        }
    }

    /**
     * Request/Response 정보를 ApiLogEntity 로 변환
     */
    private buildLogEntity(req: Request, res: Response, capturedBody: any, startTime: number, routePath: string | null): ApiLogEntity {
        const entity = new ApiLogEntity();
        entity.method = req.method;
        entity.path = routePath ?? (req.originalUrl?.split('?')[0] ?? req.url ?? '');
        entity.request_param = this.toJson(req.params);
        entity.request_query = this.toJson(req.query);
        entity.request_body = this.extractBody(req);
        entity.status_code = res.statusCode;
        entity.response_body = this.parseResponseBody(capturedBody);
        entity.error_stack = (req as any).__apiLogErrorStack ?? null;
        entity.user_id = (req as any).user?.user_id ?? null;
        entity.ip = req.ip ?? req.socket?.remoteAddress ?? null;
        entity.user_agent = (req.headers['user-agent']) ?? null;
        entity.duration_ms = Date.now() - startTime;
        return entity;
    }

    /**
     * multipart/form-data 인 경우 파일은 메타정보만, 그 외는 body 그대로
     */
    private extractBody(req: Request): any {
        const contentType = (req.headers['content-type']) ?? '';
        if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
            return this.toJson(req.body);
        }

        // multer: 단일 파일 → req.file, 다중 파일 → req.files (배열 또는 필드별 객체)
        const fileMeta: Array<{fieldname: string; originalname: string; mimetype: string; size: number}> = [];
        const anyReq = req as any;
        if (anyReq.file) {
            fileMeta.push(this.toFileMeta(anyReq.file));
        }
        if (Array.isArray(anyReq.files)) {
            for (const f of anyReq.files) fileMeta.push(this.toFileMeta(f));
        } else if (anyReq.files && typeof anyReq.files === 'object') {
            for (const key of Object.keys(anyReq.files)) {
                const arr = anyReq.files[key];
                if (Array.isArray(arr)) for (const f of arr) fileMeta.push(this.toFileMeta(f));
            }
        }

        return {
            fields: this.toJson(req.body),
            files: fileMeta,
        };
    }

    private toFileMeta(file: any): {fieldname: string; originalname: string; mimetype: string; size: number} {
        return {
            fieldname: file?.fieldname ?? '',
            originalname: file?.originalname ?? '',
            mimetype: file?.mimetype ?? '',
            size: typeof file?.size === 'number' ? file.size : 0,
        };
    }

    /**
     * 비어있거나 키가 0개면 null 로 정규화
     */
    private toJson(value: any): any {
        if (value === undefined || value === null) return null;
        if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return null;
        return value;
    }

    /**
     * res.send 로 들어온 응답을 JSON 컬럼에 저장 가능한 형태로 변환
     */
    private parseResponseBody(body: any): any {
        if (body === undefined || body === null || body === '') return null;
        if (Buffer.isBuffer(body)) return {type: 'Buffer', size: body.length};
        if (typeof body === 'object') return body;
        if (typeof body === 'string') {
            // NestJS 가 객체를 보낼 때 res.send 단계에서 이미 JSON 문자열로 변환된 상태
            try {
                return JSON.parse(body);
            } catch {
                return body;
            }
        }
        return body;
    }
}
