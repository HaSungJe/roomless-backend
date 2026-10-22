import 'dotenv/config';
import {NestFactory} from '@nestjs/core';
import {SchedulerModule} from './scheduler.module.js';

/**
 * scheduler 부트스트랩 — crontab 만 도는 서버.
 * HTTP 리스너 · 큐 소비가 없어 들어오는 연결이 없다(createApplicationContext — listen 하지 않는다).
 * 종료 훅으로 DB 연결을 정리한다. 등록된 @Cron 타이머가 프로세스를 살려 둔다.
 */
async function bootstrap(): Promise<void> {
    const app = await NestFactory.createApplicationContext(SchedulerModule);
    app.enableShutdownHooks();
}

await bootstrap();
