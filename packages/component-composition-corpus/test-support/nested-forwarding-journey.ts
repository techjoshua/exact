import { flushSync } from '@exactjs/reactive';
import { unmount } from '@exactjs/dom/root';
import { findElementOwner } from '@exactjs/dom/testing';
import type { Component } from '@exactjs/core';

/** Runs the retained nested-member contract on an already mounted or strictly adopted root.
 * Captures all transitions before assertions and leaves the host unmounted, including on failure.
 */
export function observeNestedForwarding(
	host: Element,
	owner: Component<{ record: { value: number } }>
) {
	const state = owner.state;
	const old = state.record;
	const output = host.querySelector('output');
	if (!output) throw new Error('Missing nested forwarding output');
	const leaf = findElementOwner(output);
	if (!leaf) throw new Error('Missing nested forwarding leaf owner');
	const observations: Array<{
		step: string;
		text: string | null;
		state: number;
		leafValue: unknown;
		outputIdentity: boolean;
		leafIdentity: boolean;
	}> = [];
	const observe = (step: string) => {
		observations.push({
			step,
			text: host.textContent,
			state: state.record.value,
			leafValue: leaf.props.value,
			outputIdentity: host.querySelector('output') === output,
			leafIdentity: findElementOwner(output) === leaf
		});
	};
	try {
		observe('initial');
		old.value = 2;
		flushSync();
		observe('member');
		state.record = { value: 10 };
		flushSync();
		observe('replacement');
		old.value = 3;
		flushSync();
		observe('old receiver');
		state.record.value = 11;
		flushSync();
		observe('next member');
		unmount(host);
		observe('unmount');
		state.record.value = 12;
		flushSync();
		observe('disposed');
		return observations;
	} finally {
		unmount(host);
	}
}
