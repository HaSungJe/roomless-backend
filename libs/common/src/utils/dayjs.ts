import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 플러그인을 붙인 dayjs — 날짜 · 시각의 파싱 · 비교 · 계산 · 시간대는 직접 만들지 않고 이것으로 한다.
 * - customParseFormat: 형식 지정 파싱 — `dayjs(값, 'YYYY-MM-DD HH:mm', true)` 는 strict 라 없는 날짜 · 시각(02-30 · 13월)이면 isValid() 가 false
 * - utc · timezone: 서버 시간대(TZ)와 무관한 한국 시각 — `dayjs(x).tz(KST_TIMEZONE)` · `dayjs.tz(값, 형식, KST_TIMEZONE)`
 * 앱 · 라이브러리 코드는 'dayjs' 를 직접 import 하지 않고 여기서 가져온다(플러그인이 빠진 채 쓰이지 않게).
 */
export {dayjs};

/** dayjs 인스턴스 타입 */
export type {Dayjs} from 'dayjs';

/** 한국 시간대 — 서머타임 없음 */
export const KST_TIMEZONE = 'Asia/Seoul';
