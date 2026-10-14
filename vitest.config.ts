import {defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    // tsconfig.json 의 @app/<lib>/* alias 를 해석한다.
    plugins: [tsconfigPaths()],
    test: {globals: true, root: './', include: ['apps/**/*.spec.ts', 'libs/**/*.spec.ts'], setupFiles: ['./vitest.setup.ts'], exclude: ['.back/**', 'node_modules/**', 'dist/**']},
});
