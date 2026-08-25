import type { Component } from '@exactjs/core';
import type { RouteResult } from '../types.js';

type MapPoint = {
	x: number;
	y: number;
};

type RouteMapProps = {
	route: RouteResult;
	origin: string;
	destination: string;
};

/** Renders an approximate route and any available ZIP-code locations. */
export function RouteMap(this: Component<{}>, { route, origin, destination }: RouteMapProps) {
	const start = route.origin ? project(route.origin.latitude, route.origin.longitude) : undefined;
	const end = route.destination
		? project(route.destination.latitude, route.destination.longitude)
		: undefined;
	const arc = start && end ? arcPath(start, end) : undefined;

	return () => (
		<div className="map-wrap">
			<div className="map-canvas">
				<img
					className="route-map-base"
					src="/assets/us-states.svg"
					alt=""
					width="800"
					height="370"
					loading="lazy"
					decoding="async"
				/>
				<svg
					className="route-map"
					viewBox="0 0 800 370"
					role="img"
					aria-label={
						start && end
							? `Approximate route from ${origin} to ${destination}`
							: 'Approximate United States route map; one or both ZIP codes are unavailable'
					}
				>
					{arc ? <path className="route-arc" d={arc} /> : null}
					{start ? (
						<>
							<circle className="map-point origin" cx={start.x} cy={start.y} r="6" />
							<circle className="map-halo" cx={start.x} cy={start.y} r="12" />
						</>
					) : null}
					{end ? (
						<>
							<circle className="map-point destination" cx={end.x} cy={end.y} r="6" />
							<circle className="map-halo" cx={end.x} cy={end.y} r="12" />
						</>
					) : null}
				</svg>
			</div>
			{!start || !end ? (
				<p className="map-unavailable">Map location unavailable for one or both ZIP codes.</p>
			) : null}
		</div>
	);
}

function project(latitude: number, longitude: number): MapPoint {
	if (latitude > 50 && longitude < -130)
		return { x: 76 + (longitude + 170) * 4.2, y: 316 - (latitude - 50) * 4.1 };
	if (latitude < 23 && longitude < -150)
		return { x: 205 + (longitude + 161) * 8, y: 337 - (latitude - 18) * 7 };
	if (latitude < 20 && longitude > -70)
		return { x: 671 + (longitude + 68) * 12, y: 337 - (latitude - 17.5) * 10 };
	return { x: 84 + ((longitude + 125) / 59) * 634, y: 52 + ((50 - latitude) / 26) * 235 };
}

function arcPath(start: MapPoint, end: MapPoint): string {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.hypot(dx, dy) || 1;
	const lift = Math.min(90, Math.max(28, length * 0.2));
	const middle = {
		x: (start.x + end.x) / 2 + (dy / length) * lift,
		y: (start.y + end.y) / 2 - (dx / length) * lift
	};
	return `M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}`;
}
