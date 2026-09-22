import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import { projectPreparedText } from '@exactjs/core/framework/render-structure';
import { createSsrContext } from '../../ssr/src/render/context.js';
import { executeDirectSsrComponent } from '../../ssr/src/render/direct-component.js';
import {
	readServerComponentReference,
	receiptExecutionContract,
	serverComponentProps
} from '../../ssr/src/render/server-component-reference.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	preparationAudit,
	preparationRoot
} from './prototypes/preparation.fixtures.js?exact-target=server';

beforeEach(() => Object.assign(preparationAudit, { setup: 0, mounted: 0, disposed: 0 }));

describe('server component output preparation', () => {
	it('keeps one issued component alive until its prepared text is consumed', async () => {
		const operation = preparationRoot(createCompiledIntrinsicReceipt('span', null, 'text'));
		const reference = readServerComponentReference(operation)!;
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		let ready!: () => void;
		const prepared = new Promise<void>((resolve) => {
			ready = resolve;
		});
		let outputCalls = 0;
		const completion = Promise.resolve(
			executeDirectSsrComponent(
				createSsrContext({}),
				receiptExecutionContract(reference),
				serverComponentProps(reference),
				undefined,
				{},
				async (content) => {
					outputCalls++;
					expect(content.children).toBeDefined();
					const text = projectPreparedText(content.children!);
					ready();
					await pending;
					return text;
				}
			)
		);
		try {
			await Promise.race([
				prepared,
				completion.then(() => {
					throw new Error('Output completed before preparation');
				})
			]);
			expect(preparationAudit).toEqual({ setup: 1, mounted: 0, disposed: 0 });
			release();
			expect(await completion).toBe('<span title="prepared">text</span>');
			expect(outputCalls).toBe(1);
			expect(preparationAudit).toEqual({ setup: 1, mounted: 0, disposed: 1 });
		} finally {
			release();
			await completion;
		}
	});

	it('disposes the issued server owner when preparation rejects its output', async () => {
		const reference = readServerComponentReference(
			preparationRoot(createCompiledIntrinsicReceipt('span', null))
		)!;
		const failure = new Error('preparation rejected');
		await expect(
			Promise.resolve().then(() =>
				executeDirectSsrComponent(
					createSsrContext({}),
					receiptExecutionContract(reference),
					serverComponentProps(reference),
					undefined,
					{},
					() => {
						throw failure;
					}
				)
			)
		).rejects.toBe(failure);
		expect(preparationAudit).toEqual({ setup: 1, mounted: 0, disposed: 1 });
	});
});
