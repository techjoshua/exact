import type { Component } from '@exactjs/core';

let requestClicks = 0;

function RequestParagraphRoot(this: Component<{}>, props: { label: string }) {
	return () => <p>{props.label}</p>;
}

/** Creates a compiler-issued request paragraph root. */
export const requestParagraphRoot = (label: string) => <RequestParagraphRoot label={label} />;

function RequestClickCounter() {
	return () => <button onClick={() => requestClicks++}>Click</button>;
}

/** Compiler-issued interactive root that remains owned across a server prop patch. */
export const requestClickCounterRoot = <RequestClickCounter />;

export function resetRequestClicks(): void {
	requestClicks = 0;
}

export function readRequestClicks(): number {
	return requestClicks;
}
