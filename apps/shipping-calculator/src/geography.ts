import centroids from './data/zcta-centroids.json' with { type: 'json' };
import type { GeoPoint, RouteResult } from './types.js';

const points = new Map(
	(centroids as unknown as [string, number, number][]).map(([zip, latitude, longitude]) => [
		zip,
		{ zip, latitude, longitude }
	])
);

/** Performs the point for zip domain operation. */
export function pointForZip(zip: string): GeoPoint | undefined {
	return points.get(zip.slice(0, 5));
}

/** Resolves a route. */
export function resolveRoute(originZip: string, destinationZip: string): RouteResult {
	const origin = pointForZip(originZip);
	const destination = pointForZip(destinationZip);
	if (!origin && !destination) return { status: 'unavailable' };
	if (!origin || !destination) return { status: 'partial', origin, destination };
	return {
		status: 'success',
		origin,
		destination,
		distanceMiles: Math.round(haversineMiles(origin, destination))
	};
}

/** Performs the haversine miles domain operation. */
export function haversineMiles(left: GeoPoint, right: GeoPoint): number {
	const radians = (degrees: number) => (degrees * Math.PI) / 180;
	const lat1 = radians(left.latitude);
	const lat2 = radians(right.latitude);
	const deltaLat = lat2 - lat1;
	const deltaLon = radians(right.longitude - left.longitude);
	const value =
		Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
	return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/** Performs the distance zone domain operation. */
export function distanceZone(miles: number | undefined): number {
	if (miles === undefined) return 8;
	const thresholds = [150, 300, 600, 1_000, 1_400, 1_800, 2_200];
	const index = thresholds.findIndex((value) => miles <= value);
	return index < 0 ? 8 : index + 1;
}
