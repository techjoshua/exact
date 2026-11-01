import { expect, it } from 'vitest';
import { createFrameworkFixtureComponentInstance } from '@exactjs/core/testing';
import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import { createContext, inspectExactRuntimeComponent } from '@exactjs/core';
import { verifyClientInspectionValues } from '../../component-composition-corpus/test-support/client-inspection-values-journey.mjs';
import { installExactDevtoolsRuntime, exactDevtoolsHookSymbol } from './runtime.js';

it('keeps values already delivered to the client inspectable', async () => {
	expect(
		await verifyClientInspectionValues({
			installExactDevtoolsRuntime,
			exactDevtoolsHookSymbol,
			createFrameworkFixtureComponentInstance,
			createFrameworkComponentDomain,
			inspectExactRuntimeComponent,
			createContext
		})
	).toBe(true);
});
