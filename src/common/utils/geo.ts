/**
 * 두 위경도 좌표 사이의 직선거리(haversine)를 km 로 반환.
 * @param lat1 기준점 위도
 * @param lng1 기준점 경도
 * @param lat2 대상 위도
 * @param lng2 대상 경도
 * @returns 거리(km, 정수 반올림)
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // 지구 반지름(km)
    const toRad = (deg: number): number => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
