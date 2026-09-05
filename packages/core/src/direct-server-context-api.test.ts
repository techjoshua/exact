import { describe, expect, it } from 'vitest';

import { createContext } from './keys.js';
import { ErrorContext, LoggerContext } from './component/contexts.js';
import {
	getDirectServerContext,
	hasDirectServerContext,
	setDirectServerContext,
	type DirectServerContextOwner
} from './component/direct-server-context-api.js';
import { defaultConsoleLogger } from './component/default-logger.js';
import { componentDomainLogging, createFrameworkComponentDomain } from './component/domain.js';

function createOwner(
	executionRoot: string,
	parent?: DirectServerContextOwner,
	ambientContexts?: ReadonlyMap<symbol, unknown>
): DirectServerContextOwner {
	return {
		parent,
		domain:
			parent?.domain ??
			createFrameworkComponentDomain({ target: 'server', executionRoot, logger: undefined }),
		contexts: new Map(),
		ambientContexts
	};
}

describe('direct server context operations', () => {
	it('preserves nearest-provider and ambient lookup without reactive wrappers', () => {
		const token = createContext<{ value: number }>('direct server value');
		const ambientValue = { value: 1 };
		const ambient = new Map([[token.id, ambientValue]]);
		const root = createOwner('nearest-provider', undefined, ambient);
		const child = createOwner('nearest-provider', root, ambient);
		const provided = { value: 2 };

		expect(getDirectServerContext(child, ambient, token)).toBe(ambientValue);
		setDirectServerContext(root, token, provided);
		expect(hasDirectServerContext(child, ambient, token)).toBe(true);
		expect(getDirectServerContext(child, ambient, token)).toBe(provided);
		expect(root.contexts.get(token.id)).toBe(provided);
	});

	it('throws for a missing authored context', () => {
		const owner = createOwner('missing-context');
		const token = createContext<string>('missing direct server value');

		expect(hasDirectServerContext(owner, undefined, token)).toBe(false);
		expect(() => getDirectServerContext(owner, undefined, token)).toThrow(
			'Context "missing direct server value" was not provided'
		);
	});

	it('provides canonical logging and request-isolated bounded error defaults', () => {
		const first = createOwner('first-request');
		const firstChild = createOwner('first-request', first);
		const second = createOwner('second-request');

		expect(getDirectServerContext(first, undefined, LoggerContext)).toBe(defaultConsoleLogger);
		expect(hasDirectServerContext(first, undefined, ErrorContext)).toBe(true);
		const firstErrors = getDirectServerContext(first, undefined, ErrorContext);
		expect(getDirectServerContext(firstChild, undefined, ErrorContext)).toBe(firstErrors);
		expect(getDirectServerContext(second, undefined, ErrorContext)).not.toBe(firstErrors);

		for (let index = 0; index < 105; index++) firstErrors.report(new Error(String(index)));
		expect(firstErrors.errors).toHaveLength(100);
		firstErrors.clearAll();
		expect(firstErrors.errors).toHaveLength(0);
	});

	it('marks a component logger override on the request domain', () => {
		const owner = createOwner('logger-override');
		const logger = { log() {} };
		expect(componentDomainLogging(owner.domain)?.componentOverride).toBe(false);

		setDirectServerContext(owner, LoggerContext, logger);

		expect(componentDomainLogging(owner.domain)?.componentOverride).toBe(true);
		expect(getDirectServerContext(createOwner('child', owner), undefined, LoggerContext)).toBe(
			logger
		);
	});
});
