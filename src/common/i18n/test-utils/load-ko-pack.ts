import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

const I18N_KO = join(process.cwd(), 'src/i18n/ko');

/**
 * 테스트 전용 — ko 언어팩(yaml, service/repository/dto 분리 레이아웃)을 구버전 객체 형태로 재조립.
 * 반환: { <feature>: { ...service_reasons, dto: { <field> } }, repository: { <method>: { <reason> } } }
 * spec 의 메시지 단언이 키 변경 없이 그대로 동작하도록 보장한다.
 */
export function loadKoPack(domain: string): Record<string, any> {
    const dir = join(I18N_KO, domain);
    const result: Record<string, any> = {};

    const servicePath = join(dir, 'service.yaml');
    if (existsSync(servicePath)) {
        const service = (parse(readFileSync(servicePath, 'utf8')) as Record<string, any>) ?? {};
        for (const [feature, reasons] of Object.entries(service)) {
            result[feature] = { ...(result[feature] ?? {}), ...(reasons as object) };
        }
    }

    const dtoDir = join(dir, 'dto');
    if (existsSync(dtoDir)) {
        for (const file of readdirSync(dtoDir)) {
            const feature = file.replace(/\.dto\.yaml$/, '');
            const fields = (parse(readFileSync(join(dtoDir, file), 'utf8')) as Record<string, any>) ?? {};
            result[feature] = { ...(result[feature] ?? {}), dto: fields };
        }
    }

    const repoPath = join(dir, 'repository.yaml');
    if (existsSync(repoPath)) {
        result.repository = (parse(readFileSync(repoPath, 'utf8')) as Record<string, any>) ?? {};
    }

    return result;
}
