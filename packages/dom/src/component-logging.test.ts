/**
 * @vitest-environment jsdom
 */
import type { Component, LogEvent, Logger } from '@exactjs/core';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';
import { jsx } from './test-support/native-vnode.js';

describe('@exactjs/dom component logging', () => {
	it('uses the root logger for framework diagnostics', () => {
		const events: LogEvent[] = [];
		const logger: Logger = {
			isEnabled: () => true,
			log: (event) => events.push(event)
		};

		const container = document.createElement('div');
		render(jsx('span', { children: 'first' }), container, { logger });
		render(jsx('strong', { children: 'second' }), container, { logger });

		expect(events).toContainEqual(
			expect.objectContaining({
				level: 'trace',
				message: 'replace node',
				scope: {
					source: 'framework',
					packageName: 'dom',
					category: 'patch'
				}
			})
		);
	});

	it('inherits the root logger for component interaction performance traces', async () => {
		const events: LogEvent[] = [];
		const logger: Logger = {
			isEnabled: (level) => level === 'trace',
			log: (event) => events.push(event)
		};
		function Counter(this: Component<{ count: number }>) {
			this.state.count = 0;
			return () =>
				jsx('button', {
					onClick: () => this.state.count++,
					children: this.state.count
				});
		}
		const container = document.createElement('div');
		render(jsx(Counter, {}), container, { logger });

		container.querySelector('button')!.click();
		await vi.waitFor(() =>
			expect(events.some((event) => event.message === 'performance interaction settled')).toBe(true)
		);

		const traces = events
			.filter((event) => event.message.startsWith('performance interaction'))
			.map((event) => event.data as Record<string, unknown>);
		expect(traces.map((trace) => trace.phase)).toEqual([
			'started',
			'handler-complete',
			'feedback-committed',
			'settled'
		]);
		expect(traces[2]!.attributes).toEqual({
			reconciliations: expect.any(Number),
			traversedNodes: expect.any(Number)
		});
	});
});
