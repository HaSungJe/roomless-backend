import 'dotenv/config';
import {DataSource} from 'typeorm';
import {buildDataSourceOptions} from './typeorm.config.js';

/**
 * 마이그레이션 실행 · TypeORM CLI 용 DataSource.
 * 앱 런타임은 TypeOrmModule 이 같은 설정(buildDataSourceOptions)으로 별도 DataSource 를 만든다.
 */
export const AppDataSource = new DataSource(buildDataSourceOptions());
