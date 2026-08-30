import type { Component } from '@exactjs/core';

let requestClicks = 0;

function ReorderedControlsRoot(this: Component<{}>, props: { reversed: boolean }) {
	return () =>
		props.reversed ? (
			<>
				<input data-exact-id="b" name="title" value="B" />
				<input data-exact-id="a" name="title" value="A" />
			</>
		) : (
			<>
				<input data-exact-id="a" name="title" value="A" />
				<input data-exact-id="b" name="title" value="B" />
			</>
		);
}

function RequestParagraphRoot(this: Component<{}>, props: { label: string }) {
	return () => <p>{props.label}</p>;
}

/** Compiler-issued reordered form-control root. */
export const reorderedControlsRoot = (reversed: boolean) => (
	<ReorderedControlsRoot reversed={reversed} />
);

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
