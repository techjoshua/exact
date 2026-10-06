import type { Component } from '@exactjs/core';
import { reassignedHandler, handlerReceipt } from './event-function-declaration.js';

let mutableHandler: (event?: { type: string }) => void = () => {};
let destructuredHandler: (event?: { type: string }) => void = () => {};

function installDestructuredHandler(handler: (event?: { type: string }) => void) {
	({ destructuredHandler } = { destructuredHandler: handler });
}
/** Records the event delivered to a reassigned module-level handler. */
export let deliveredEvent: string | undefined;
/** Installs a handler that needs the DOM event before the component is mounted. */
export function replaceMutableHandler() {
	deliveredEvent = undefined;
	mutableHandler = (event) => {
		deliveredEvent = event?.type;
	};
}

/** Exercises both compiled and general event-property lowering with a mutable handler. */
export function MutableEventHandlers(this: Component<{ delivered: string; count: number }>) {
	this.state.delivered = '';
	this.state.count = 0;
	mutableHandler = (event) => {
		deliveredEvent = event?.type;
		this.state.delivered = `${++this.state.count}:${event?.type ?? 'missing'}`;
	};
	installDestructuredHandler((event) => {
		deliveredEvent = event?.type;
		this.state.delivered = `${++this.state.count}:${event?.type ?? 'missing'}`;
	});
	handlerReceipt.current = (event?: { type: string }) => {
		deliveredEvent = event?.type;
		this.state.delivered = `${++this.state.count}:${event?.type ?? 'missing'}`;
	};
	return () => (
		<main>
			<button data-handler="compiled" onClick={mutableHandler}>
				Compiled
			</button>
			<exact-handler data-handler="general" onClick={mutableHandler}>
				General
			</exact-handler>
			<output data-handler-result>{this.state.delivered}</output>
			<button data-handler="destructured" onClick={destructuredHandler}>
				Destructured
			</button>
			<button data-handler="function" onClick={reassignedHandler}>
				Function
			</button>
		</main>
	);
}
/** Creates the event-handler receipt for paired mount and hydration checks. */
export const mutableHandlerRoot = () => <MutableEventHandlers />;
