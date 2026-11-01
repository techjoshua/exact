import { attemptCleanup, createCleanupFailure, throwCleanupFailure } from '@exactjs/core';
import type { ReactNode } from '../types.js';

/** A leaf's array scope and local slot, retained so renderers can distinguish equal keys in separate groups. */
export type ReactChildEntry = { node: ReactNode; scope: string; index: number };

/**
 * Visits nested arrays without native stack growth. Array iterators retain their authored order,
 * and holes remain undefined leaves. Shared sibling arrays are visited independently. Ancestor
 * cycles throw TypeError. Entered iterators close inside out on failure or early consumer exit,
 * preserving an initiating failure. Storage follows array depth rather than total leaf count.
 */
export function iterateReactChildEntries(node: ReactNode): Generator<ReactChildEntry>;
/** Traverses leaf values without allocating identity entries when the consumer needs no array scope. */
export function iterateReactChildEntries(node: ReactNode, valuesOnly: true): Generator<ReactNode>;
export function* iterateReactChildEntries(
	node: ReactNode,
	valuesOnly = false
): Generator<ReactChildEntry | ReactNode> {
	const active = new WeakSet<object>();
	const frames: Array<{
		array: ReactNode[];
		iterator: Iterator<ReactNode>;
		next: Iterator<ReactNode>['next'];
		scope: string;
		index: number;
	}> = [];
	let selected = true;
	let scope = '';
	let index = 0;
	let failed = false;
	try {
		while (selected || frames.length) {
			if (selected) {
				selected = false;
				if (!Array.isArray(node)) {
					yield valuesOnly ? node : { node, scope, index };
					continue;
				}
				if (active.has(node)) throw new TypeError('Cyclic React child array');
				const iterator = node[Symbol.iterator]();
				if (iterator === null || (typeof iterator !== 'object' && typeof iterator !== 'function'))
					throw new TypeError('Invalid React child iterator');
				const nextScope =
					!valuesOnly && frames.length ? (scope ? scope + ':' : '.') + index.toString(36) : '';
				active.add(node);
				frames.push({ array: node, iterator, next: iterator.next, scope: nextScope, index: 0 });
			}
			const frame = frames[frames.length - 1]!;
			const step = Reflect.apply(frame.next, frame.iterator, []);
			if (step === null || (typeof step !== 'object' && typeof step !== 'function'))
				throw new TypeError('Invalid React child iterator result');
			if (step.done) {
				active.delete(frame.array);
				frames.pop();
			} else {
				node = step.value;
				scope = frame.scope;
				index = frame.index++;
				selected = true;
			}
		}
	} catch (error) {
		failed = true;
		throw error;
	} finally {
		if (frames.length) {
			const failure = createCleanupFailure();
			while (frames.length) {
				const frame = frames.pop()!;
				attemptCleanup(failure, () => {
					const close = frame.iterator.return;
					if (close === undefined || close === null) return;
					const result = Reflect.apply(close, frame.iterator, []);
					if (result === null || (typeof result !== 'object' && typeof result !== 'function'))
						throw new TypeError('Invalid React child iterator close result');
				});
			}
			if (!failed) throwCleanupFailure(failure);
		}
	}
}

/** Combines a local key or positional slot with its containing array scope, escaping reserved key separators. */
export function reactChildEntryKey(
	entry: ReactChildEntry,
	authoredKey: string | number | null | undefined
): string {
	const key =
		authoredKey === null || authoredKey === undefined
			? entry.index.toString(36)
			: '$' + String(authoredKey).replace(/[=:]/g, (value) => (value === '=' ? '=0' : '=2'));
	return (entry.scope ? entry.scope + ':' : '.') + key;
}
