/**
 * @vitest-environment jsdom
 */
import { unwrap } from '@exactjs/core';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import type { AriaRefList } from './contracts.js';
import { createRelationshipContributions } from './relationships.js';
import { testRefBinding } from './test-support/ref-binding.js';

describe('@exactjs/accessibility relationships', () => {
	it('preserves authored IDs and deduplicates ordered list relationships', () => {
		const first = document.createElement('span');
		first.id = 'first-help';
		const second = document.createElement('span');
		const firstRef = testRefBinding<Element>(first);
		const secondRef = testRefBinding<Element>(second);
		const contributions = createRelationshipContributions({
			describedBy: [firstRef, secondRef, firstRef]
		});

		const value = unwrap(contributions['aria-describedby']);
		expect(value).toBe(`first-help ${second.id}`);
		expect(second.id).toMatch(/^exact-[0-9a-f-]{36}$/u);
	});

	it('omits a relationship instead of replacing a malformed authored ID', () => {
		const label = document.createElement('span');
		label.id = 'invalid id';
		const contributions = createRelationshipContributions({
			labelledBy: testRefBinding<Element>(label)
		});

		expect(unwrap(contributions['aria-labelledby'])).toBeUndefined();
		expect(label.id).toBe('invalid id');
	});

	it('reactively deactivates a relationship without removing permanent target identity', () => {
		const help = document.createElement('span');
		const binding = testRefBinding<Element>(help);
		const state = reactive({ enabled: true });
		const contributions = createRelationshipContributions({
			describedBy: computed(() => (state.enabled ? binding : false)) as unknown as AriaRefList
		});
		const active = unwrap(contributions['aria-describedby']);
		const generated = help.id;
		expect(active).toBe(generated);
		state.enabled = false;
		flushSync();
		expect(unwrap(contributions['aria-describedby'])).toBeUndefined();
		expect(help.id).toBe(generated);
	});
});
