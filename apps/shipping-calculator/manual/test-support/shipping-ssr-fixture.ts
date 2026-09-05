import { type AnyComponentInstance } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-abi';
import { writeNodeResponseBody } from '@exactjs/node-adapter';
import {
	createExactServerRuntime,
	renderExactRequestToProgressiveHtmlResponse
} from '@exactjs/ssr';
import { composeExactExecutorContract, createExactHydrationConfig } from '@exactjs/server';
import type { ServerResponse } from 'node:http';
import { CalculatorWorkspace, ShippingCalculatorPage } from '../../.exact/App.exact.server.js';
import { clearQuoteCache, configuredProviderIds } from '../../src/providers/registry.js';

const allocationSink = {
	write: () => true
} as unknown as ServerResponse;

/** Creates an isolated production-shaped shipping SSR fixture for opt-in memory diagnostics. */
export function createShippingSsrFixture() {
	const contract = composeExactExecutorContract([ShippingCalculatorPage, CalculatorWorkspace], {
		endpoint: '/__exact'
	});
	const runtime = createExactServerRuntime({ contract, patchStrategy: 'element' });

	return {
		async render(onComponentCreated?: (instance: AnyComponentInstance) => void): Promise<void> {
			const url = 'http://localhost:4175/';
			const hydration = createExactHydrationConfig(contract, {
				state: { configuredProviders: configuredProviderIds() },
				includeContinuations: false
			});
			const response = await renderExactRequestToProgressiveHtmlResponse(
				{ method: 'GET', url },
				runtime,
				() => createCompiledComponentReceipt(ShippingCalculatorPage, { url }),
				{
					rootId: 'app',
					maxTaskDurationMs: 1_200,
					...hydration,
					onComponentCreated
				}
			);
			await writeNodeResponseBody(allocationSink, response);
		},
		async dispose(): Promise<void> {
			await runtime.dispose?.();
			clearQuoteCache();
		}
	};
}
