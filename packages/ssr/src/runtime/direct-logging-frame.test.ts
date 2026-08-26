import { describe, expect, it } from 'vitest';
import { type AnyComponentFunction, type LogEvent, type Logger } from '@exactjs/core';
import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import { componentLogMethod } from '@exactjs/core/runtime/logging';
import type { SsrContext } from '../types.js';
import { createDirectSsrLoggingFrame } from './direct-logging-frame.js';

describe('direct SSR logging frames', () => {
	it('logs through request-owned domain state without constructing a durable component', () => {
		const events: LogEvent[] = [];
		let enabled = false;
		const logger: Logger = {
			isEnabled: () => enabled,
			log: (event) => events.push(event)
		};
		const domain = createFrameworkComponentDomain({
			executionRoot: 'direct-logging-test',
			target: 'server',
			logger
		});
		function LoggedPanel() {
			return () => null;
		}
		const frame = createDirectSsrLoggingFrame(
			{ componentDomain: domain } as SsrContext,
			LoggedPanel as AnyComponentFunction,
			'logged-panel',
			undefined
		);

		let argumentReads = 0;
		componentLogMethod(
			frame,
			'info'
		)?.(() => {
			argumentReads++;
			return ['disabled'];
		});
		enabled = true;
		componentLogMethod(
			frame,
			'info'
		)?.(() => {
			argumentReads++;
			return ['rendering', { request: 1 }];
		});

		expect(argumentReads).toBe(1);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			level: 'info',
			message: 'rendering',
			data: { request: 1 },
			scope: {
				source: 'component',
				component: { id: 'logged-panel', name: 'LoggedPanel', mounted: false }
			}
		});
	});
});
