import { haversineKm } from '../geo';

describe('haversineKm', () => {
    it('[SUCCESS] 동일 좌표 → 0km', () => {
        expect(haversineKm(37.5665, 126.9780, 37.5665, 126.9780)).toBe(0);
    });

    it('[SUCCESS] 서울→도쿄 ≈ 1150km (±60)', () => {
        const d = haversineKm(37.5665, 126.9780, 35.6762, 139.6503);
        expect(d).toBeGreaterThan(1100);
        expect(d).toBeLessThan(1210);
    });

    it('[SUCCESS] 서울→뉴욕 ≈ 11000km (±400)', () => {
        const d = haversineKm(37.5665, 126.9780, 40.7128, -74.0060);
        expect(d).toBeGreaterThan(10600);
        expect(d).toBeLessThan(11400);
    });

    it('[SUCCESS] 대칭성 — A→B == B→A', () => {
        const ab = haversineKm(37.5665, 126.9780, 48.8566, 2.3522);
        const ba = haversineKm(48.8566, 2.3522, 37.5665, 126.9780);
        expect(ab).toBe(ba);
    });
});
