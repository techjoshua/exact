import { describe, expect, it } from 'vitest';
import * as hydration from './index.js';

describe('@exactjs/hydrate public facade', () => {
	it('keeps transport and unscoped patch authority package-private', () => {
		expect(hydration).not.toHaveProperty('invokeExact');
		expect(hydration).not.toHaveProperty('invokeExactBatch');
		expect(hydration).not.toHaveProperty('ExactBuildUnsupportedError');
		expect(hydration).not.toHaveProperty('applyPatches');
	});
});
