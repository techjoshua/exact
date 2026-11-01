// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { resolveRootHydrateOptions } from './root-config.js';
import { resolveHydrateOptions } from './config.js';
import { hydrate as hydrateRoot } from './root.js';
import { hydrate as hydrateFull } from './index.js';
import { hydrate as hydrateEnhanced } from './enhanced.js';
import { hydrateCompiledComponentInputRoot } from './framework/component-root.js';
import { createCompiledComponentOperation } from '../../dom/src/test-support/native-operations.js';
import { DomainInspectedPanel } from '../../dom/src/test-support/components/component-domains.fixtures.js';
import { verifyHydrationOptions } from '../../component-composition-corpus/test-support/hydration-options-journey.mjs';

it.each([resolveRootHydrateOptions, resolveHydrateOptions])(
	'preserves inherited configuration without freezing live aliases',
	(resolve) => {
		const profile = () => {};
		class Options {
			maximum = 100;
			get maxTreeNodes() {
				return this.maximum;
			}
			get onProfile() {
				return profile;
			}
		}
		const options = new Options();
		const resolved = resolve(document.createElement('main'), options);
		expect(resolved.maxTreeNodes).toBe(100);
		options.maximum = 200;
		expect(resolved.maxTreeNodes).toBe(200);
		expect(resolved.onProfile).toBeTypeOf('function');
		resolved.maxTreeNodes = 300;
		expect(options.maxTreeNodes).toBe(200);
		expect(resolved.maxTreeNodes).toBe(300);
	}
);
it.each([hydrateRoot, hydrateFull, hydrateEnhanced, hydrateCompiledComponentInputRoot])(
	'retains options across hydration and existing-root updates',
	async (hydrate) => {
		expect(
			await verifyHydrationOptions({
				Panel: DomainInspectedPanel,
				operation: createCompiledComponentOperation,
				hydrate
			})
		).toBe(true);
	}
);
