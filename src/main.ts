import { addTransactionalDataSource, initializeTransactionalContext } from 'typeorm-transactional';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { CustomErrorFilter } from './exception/exception';
import { ApiLogInterceptor } from './modules/api-log/api-log.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationErrorDto } from './common/dto/global.result.dto';
import { DataSource } from 'typeorm';
import dayjs from 'dayjs';
import * as bodyParser from 'body-parser';

/**
 * Swagger 선택박스 js 소스
 * 
 * @param selectboxItemText 
 * @returns 
 */
function getSwaggerJs(selectboxItemText: string): string {
    return `
        $(document).ready(function() {
            // 현재 페이지 정보
            const page = window.location.origin + window.location.pathname;

        // 서버 변경시, 주소 이동
            $(document).on('change', '#swaggerList', function() {
                location.href = $(this).val();
            });

            // 서버목록 해당 페이지 맞는 것으로 선택하기
            const selectPage = setInterval(() => {
                const target = $(".schemes-server-container");
                if (target) {
                    const html = \`
                        <div>
                            <span class="servers-title">Tap</span>
                            <div class="servers">
                                <label for="swaggerList">
                                    <select id="swaggerList">
                                        ${selectboxItemText}
                                    </select>  
                                </label>
                            </div>
                        </div>
                    \`;
                    target.append(html);
                    $("#swaggerList").val(page);
                    clearInterval(selectPage);
                }
            }, 100);
        });
    `;
}

async function bootstrap() {
    // 트렌젝션 컨텍스트 초기화
    initializeTransactionalContext();

    // bodyParser:false — Nest 기본 parser 비활성. 아래 수동 bodyParser.json({verify}) 만 동작해
    // webhook 서명검증용 raw body(req.rawBody)를 보존한다. (기본 parser 가 먼저 스트림을 소비하면 verify 가 스킵됨)
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

    // JSON Parser의 크기 제한 설정
    // verify 콜백으로 raw body 를 req.rawBody 에 보존 — webhook 서명검증(HMAC) 용
    const limit = '15Mb';
    app.use(bodyParser.json({ limit, verify: (req: any, _res, buf: Buffer) => { req.rawBody = buf; } }));
    app.use(bodyParser.urlencoded({ limit, extended: true }));
    app.useGlobalFilters(new CustomErrorFilter());

    // API 호출 자동 로깅 — 모든 요청/응답을 t_api_log 에 저장
    app.useGlobalInterceptors(app.get(ApiLogInterceptor));

    // API Swagger
    const reflector = app.get(Reflector);
    const rawModules: any[] = Reflect.getMetadata('imports', AppModule) || [];
    const modules = rawModules.filter((m: any) => m && typeof m === 'function');

    // API Swagger 링크생성
    const isSwaggerTargetSelect: boolean = 'T' === process?.env?.SWAGGER_TARGET_SELECT ? true : false;
    const swagger_targets: string[] = process?.env?.SWAGGER_TARGET ? process?.env?.SWAGGER_TARGET?.toString()?.split(',') : [];
    const swagger_path = process.env.SWAGGER_PATH ? process.env.SWAGGER_PATH : 'swagger';
    const jqueryCDN = `https://code.jquery.com/jquery-3.7.1.slim.js`;
    if (isSwaggerTargetSelect) {
        let selectBoxHtml = ``;
        for (let i=0; i<modules.length; i++) {
            const type = reflector.get<string>('type', modules[i]);
            if (type && type === 'API') {
                const path = reflector.get<string>('path', modules[i]);
                if (swagger_targets.includes(path)) {
                    const description = reflector.get<string>('description', modules[i]);
                    selectBoxHtml += `<option value="${process.env.SWAGGER_URL}/${swagger_path}/${path}">${description}</option>`;
                }
            }
        }
        const js = getSwaggerJs(selectBoxHtml);

        // Swagger - 개별
        for (let i=0; i<modules.length; i++) {
            const type = reflector.get<string>('type', modules[i]);
            if (type && type === 'API') {
                const path = reflector.get<string>('path', modules[i]);
                if (swagger_targets.includes(path)) {
                    const bearerAuthName: string = 'access-token';
                    const swaggerApiConfigData = new DocumentBuilder();
                    swaggerApiConfigData.setTitle(process.env.SWAGGER_TITLE || 'API 문서');
                    swaggerApiConfigData.setVersion(dayjs().format('YYYY-MM-DD HH:mm'));
                    swaggerApiConfigData.addServer(process.env.SWAGGER_URL);
                    swaggerApiConfigData.addBearerAuth({type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', in: 'header'}, bearerAuthName);
                    const swaggerApiConfig = swaggerApiConfigData.build();
                    SwaggerModule.setup(`${swagger_path}/${path}`, app, SwaggerModule.createDocument(app, swaggerApiConfig, {
                        include: [modules[i]]
                    }), {
                        customJs: jqueryCDN,
                        customJsStr: js
                    });
                }
            }
        }
    } else {
        let selectBoxHtml = `<option value="${process.env.SWAGGER_URL}/${swagger_path}" selected>전체</option>`;
        for (let i=0; i<modules.length; i++) {
            const type = reflector.get<string>('type', modules[i]);
            if (type && type === 'API') {
                const path = reflector.get<string>('path', modules[i]);
                const description = reflector.get<string>('description', modules[i]);
                selectBoxHtml += `<option value="${process.env.SWAGGER_URL}/${swagger_path}/${path}">${description}</option>`;
            }
        }
        const js = getSwaggerJs(selectBoxHtml);

        // Swagger - 전체
        const swaggerApiConfigData = new DocumentBuilder();
        swaggerApiConfigData.setTitle(process.env.SWAGGER_TITLE || 'API 문서');
        swaggerApiConfigData.setVersion(dayjs().format('YYYY-MM-DD HH:mm'));
        swaggerApiConfigData.addServer(process.env.SWAGGER_URL);
        const swaggerApiConfig = swaggerApiConfigData.build();
        SwaggerModule.setup(swagger_path, app, SwaggerModule.createDocument(app, swaggerApiConfig, {
            include: modules.filter(m => reflector.get<string>('type', m) === 'API'),
        }), {
            customJs: jqueryCDN,
            customJsStr: js
        });

        // Swagger - 개별
        for (let i=0; i<modules.length; i++) {
            const type = reflector.get<string>('type', modules[i]);
            if (type && type === 'API') {
                const path = reflector.get<string>('path', modules[i]);
                const bearerAuthName: string = 'access-token';
                const swaggerApiConfigData = new DocumentBuilder();
                swaggerApiConfigData.setTitle(process.env.SWAGGER_TITLE || 'API 문서');
                swaggerApiConfigData.setVersion(dayjs().format('YYYY-MM-DD HH:mm'));
                swaggerApiConfigData.addServer(process.env.SWAGGER_URL);
                swaggerApiConfigData.addBearerAuth({type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', in: 'header'}, bearerAuthName);
                const swaggerApiConfig = swaggerApiConfigData.build();

                SwaggerModule.setup(`${swagger_path}/${path}`, app, SwaggerModule.createDocument(app, swaggerApiConfig, {
                    include: [modules[i]]
                }), {
                    customJs: jqueryCDN,
                    customJsStr: js
                });
            }
        }
    }

    // CORS
    app.enableCors({
        "origin": "*",
        "allowedHeaders": "*",
        "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
        "preflightContinue": false,
        "optionsSuccessStatus": 204
    });

    // class-validator Pipe
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            forbidNonWhitelisted: true,
            exceptionFactory: (errors) => {
                const result: Record<string, any> = {};
                result.validationErrors = [];

                for (let i=0; i<errors.length; i++) {
                    const error = errors[i];
                    const errorDto = new ValidationErrorDto();
                    errorDto.type = (Object.keys(errors[i]['constraints']))[0];

                    if (errorDto.type === 'isBoolean') {
                        if (error?.contexts) {
                            errorDto.property = error?.contexts[errorDto.type]?.target || '';
                            errorDto.message = error?.constraints[errorDto.type];
                        } else {
                            errorDto.property = error?.property;
                            errorDto.message = error?.constraints[errorDto.type];
                        }
                    } else {
                        errorDto.property = error?.property;
                        errorDto.message = error?.constraints[errorDto.type];
                    }

                    result.validationErrors.push(errorDto)
                }

                result.message = result.validationErrors.length > 0 ? result.validationErrors[0].message : '실패했습니다.';
                return new BadRequestException(result);
            }
        }),
    );

    // DataSource를 가져와서 트랜잭션 지원 추가
    const dataSource = app.get(DataSource);
    addTransactionalDataSource(dataSource);

    await app.listen(process.env.SERVER_PORT || 3000);
}

void bootstrap();
