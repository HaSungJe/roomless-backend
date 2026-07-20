// 언어팩(src/i18n)을 빌드 산출물(dist/i18n)로 복사.
// nest-cli webpack:true 라 json 이 번들에 포함되지 않으므로 빌드 후 수동 복사 필요.
// nestjs-i18n 은 런타임에 fs 로 폴더를 읽으며, prod 는 dist 만 배포하므로 dist 안에 있어야 함.
const { cpSync, existsSync } = require('fs');
const { join } = require('path');

const src = join(process.cwd(), 'src', 'i18n');
const dest = join(process.cwd(), 'dist', 'i18n');

if (!existsSync(src)) {
    console.error(`[copy-i18n] source not found: ${src}`);
    process.exit(1);
}

cpSync(src, dest, { recursive: true });
console.log(`[copy-i18n] copied ${src} -> ${dest}`);
