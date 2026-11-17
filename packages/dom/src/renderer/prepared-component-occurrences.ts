import type { PreparedComponentProjection } from './prepared-component-attachment.js';
import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { PreparedComponentAttachment } from './prepared-component-attachment.js';

/** One retained output occurrence, selected by sequence rather than raw-operation lookup. */
export type PreparedComponentOccurrence = Readonly<{
	operation: object;
	parent: AnyComponentInstance | undefined;
	attachment: PreparedComponentAttachment;
	project?: PreparedComponentProjection;
}>;

/** Synchronous preparation handoff. Nested frames retain their preceding frame's actual cursor. */
export class PreparedComponentOccurrences {
	private readonly entries: PreparedComponentOccurrence[] = [];
	private cursor = 0;
	constructor(private readonly previous?: PreparedComponentOccurrences) {}

	/** Appends an occurrence in the same retained order that its construction path will consume. */
	append(entry: PreparedComponentOccurrence): void {
		this.entries.push(entry);
	}

	/** Claims only the next carried entry. Identity and parent validate it, never select a match. */
	take(
		operation: object,
		parent: AnyComponentInstance | undefined
	): PreparedComponentOccurrence | undefined {
		const entry = this.entries[this.cursor];
		if (!entry) return this.previous?.take(operation, parent);
		if (entry.operation !== operation || entry.parent !== parent)
			throw new Error('Prepared component output sequence changed before consumption');
		this.cursor++;
		return entry;
	}
}
