import {Injectable, NestMiddleware} from '@nestjs/common';
import type {NextFunction, Request, Response} from 'express';
import {ERROR_STACK_LOCAL} from '@app/common/exception/custom-error.filter.js';
import {dayjs} from '@app/common/utils/dayjs.js';
import {buildApiLogEntity, collectApiLogChunk, isApiLogExcluded, toRequestPath} from './api-log.util.js';
import {ApiLogWriter} from './api-log.writer.js';

/**
 * API 로그 기록 미들웨어(게이트웨이 인프라) — 모든 HTTP 요청의 응답이 끝나면 한 번 기록해 로그 전용 연결로 넣는다(사용자 결정 2026-11-10).
 * 미들웨어라 가드(401) · 없는 경로(404) · 검증(400)에서 끝난 요청도 지난다. 응답 본문은 res.write · res.end 를 가로채 모은다(JSON · SSE 공통).
 * 넣기는 기다리지 않는다 — 실패하면 그 로그만 빠진다(요청에는 영향 없음).
 */
@Injectable()
export class ApiLogMiddleware implements NestMiddleware {
    /**
     * @param apiLogWriter 로그 전용 적재
     */
    constructor(private readonly apiLogWriter: ApiLogWriter) {}

    /**
     * 요청 시작 — 응답 조각을 모으고, 응답이 끝나면(finish · close 중 먼저 — 한 번) 기록해 넣는다.
     *
     * @param req 요청
     * @param res 응답
     * @param next 다음
     */
    use(req: Request, res: Response, next: NextFunction): void {
        if (isApiLogExcluded(toRequestPath(req.originalUrl), process.env.SWAGGER_PATH || 'swagger')) {
            next();
            return;
        }
        const startedAt = dayjs();
        const chunks: Buffer[] = [];
        const write = res.write.bind(res) as (...args: unknown[]) => boolean;
        const end = res.end.bind(res) as (...args: unknown[]) => Response;
        res.write = ((chunk: unknown, ...rest: unknown[]) => {
            collectApiLogChunk(chunks, chunk);
            return write(chunk, ...rest);
        }) as Response['write'];
        res.end = ((chunk?: unknown, ...rest: unknown[]) => {
            collectApiLogChunk(chunks, chunk);
            return end(chunk, ...rest);
        }) as Response['end'];

        let recorded = false;
        const record = (): void => {
            if (recorded) {
                return;
            }
            recorded = true;
            const entity = buildApiLogEntity({
                created_at: startedAt.toDate(),
                method: req.method,
                route_path: (req.route as {path?: unknown} | undefined)?.path,
                original_url: req.originalUrl,
                params: req.params,
                query: req.query,
                body: req.body,
                status_code: res.statusCode,
                content_type: String(res.getHeader('content-type') ?? ''),
                response_text: Buffer.concat(chunks).toString('utf8'),
                error_stack: res.locals[ERROR_STACK_LOCAL],
                user_id: (req as Request & {user?: {user_id?: string}}).user?.user_id ?? null,
                ip: req.ip ?? null,
                user_agent: req.headers['user-agent'] ?? null,
                duration_ms: dayjs().diff(startedAt),
            });
            void this.apiLogWriter.write(entity);
        };
        res.on('finish', record);
        res.on('close', record);
        next();
    }
}
