import type { Child } from '@exactjs/core';

let notifications = 0;

/** Clears observations between independent hydration ownership journeys. */
export function resetDormantIslandNotifications(): void {
	notifications = 0;
}

/** Returns notifications delivered to the compiled hover handler. */
export function readDormantIslandNotifications(): number {
	return notifications;
}

/** Preserves independent descendants inside a server-owned child range. */
export function DormantIslandShell(props: { children?: Child | Child[] }) {
	return () => <section>{props.children}</section>;
}

/** Uses an event outside bounded lazy replay, requiring eager activation. */
export function EagerHoverIsland() {
	return () => <button onMouseEnter={() => notifications++}>Hover</button>;
}
