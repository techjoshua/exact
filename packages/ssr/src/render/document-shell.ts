import type { Child } from '@exactjs/core';
import type { SsrResumptionCapture } from '../resumption.js';
import type { RenderToStringOptions } from '../types.js';
import {
	readServerComponentReference,
	type ServerComponentReference
} from './server-component-reference.js';

/** Request-local boundary between a server-only shell and its application hydration subtree. */
export class DocumentShellScope {
	private visits = 0;
	readonly reference: ServerComponentReference;

	/** Shell snapshots track boundary visits for rollback but publish no shell state. */
	readonly capture: SsrResumptionCapture = {
		checkpoint: () =>
			(this.applicationOptions.resumptionCapture?.checkpoint() ?? 0) * 2 + this.visits,
		rollback: (checkpoint) => {
			this.visits = checkpoint % 2;
			this.applicationOptions.resumptionCapture?.rollback(Math.floor(checkpoint / 2));
		},
		reserveDirect: () => undefined,
		publishDirect: () => {},
		serializedRecords: () => [],
		activations: () => []
	};

	constructor(
		root: Child,
		readonly applicationOptions: RenderToStringOptions
	) {
		const reference = readServerComponentReference(root);
		if (!reference)
			throw new TypeError('documentShell requires a compiler-issued application component');
		this.reference = reference;
	}

	/** Claims one application position; a shell cannot duplicate its hydration root. */
	claim(reference: ServerComponentReference): boolean {
		if (reference !== this.reference) return false;
		if (this.visits++) throw new Error('A document shell must render its application exactly once');
		return true;
	}

	/** Rejects a shell that dropped the application or did not render a document. */
	complete(documentRootSeen: boolean): void {
		if (this.visits !== 1)
			throw new Error('A document shell must render its application exactly once');
		if (!documentRootSeen) throw new Error('A document shell must render a root html document');
	}
}
