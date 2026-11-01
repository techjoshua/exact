/** @vitest-environment jsdom */
import '../framework/enhancements.js';
import { expect, it } from 'vitest';
import { createEnhancementNode } from '@exactjs/core';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import {
	createCompiledComponentOperation,
	createOperation
} from '../test-support/native-operations.js';
import {
	RoutingBoundary,
	RoutingLeftShell
} from '../test-support/enhancements/enhancement-behavior.fixtures.js';
import { createRendererRoot } from './root-construction.js';
import { readClientComponentInput } from './component-input-admission.js';
import type { Mounted } from '../types.js';
import {
	capturePreparedEnhancementBindings,
	preparedEnhancementBinding,
	withCapturedEnhancementBindings,
	withPreparedEnhancementBindings
} from './prepared-output-bindings.js';

it.each([false, true])('releases captured target routes after a claim, rejected=%s', (rejected) => {
	const identity = './routing#left';
	const operation = createCompiledComponentOperation(RoutingBoundary, {
		__exactEnhancements: createEnhancementNode([{ identity, props: {} }])
	});
	const root = createRendererRoot(
		document.createElement('main'),
		operation,
		{
			enhancementCatalog: new Map([[identity, RoutingLeftShell]])
		},
		{ mode: 'client', version: 0 }
	);
	const scope = createEffectScope();
	const boundary: Mounted = {
		operation,
		componentReceipt: readClientComponentInput(operation),
		dom: document.createTextNode(''),
		scope,
		children: []
	};
	const child = createOperation('button', null);
	try {
		const captured = withPreparedEnhancementBindings(root, boundary, [child], () => {
			expect(preparedEnhancementBinding(root, child)?.entries[0]?.identity).toBe(identity);
			return capturePreparedEnhancementBindings(root);
		});
		expect(captured?.size).toBe(1);
		expect(preparedEnhancementBinding(root, child)).toBeUndefined();
		const claim = () =>
			withCapturedEnhancementBindings(root, captured, () => {
				expect(preparedEnhancementBinding(root, child)?.entries[0]?.identity).toBe(identity);
				if (rejected) throw new Error('rejected target claim');
			});
		if (rejected) expect(claim).toThrow('rejected target claim');
		else claim();
		expect(capturePreparedEnhancementBindings(root)).toBeUndefined();
	} finally {
		scope.stop();
	}
});
