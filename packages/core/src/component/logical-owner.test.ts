import { expect, it, vi } from 'vitest';
import { createFrameworkComponentDomain, withComponentResumption } from './domain.js';
import { createFrameworkLogicalOwner } from './logical-owner.js';
import { registerComponentLifecycleHandler } from './lifecycle-handlers.js';

it('releases framework lifecycle handlers exactly once after logical ownership ends', () => {
	const domain = createFrameworkComponentDomain({ executionRoot: 'logical-owner-cleanup' });
	const owner = createFrameworkLogicalOwner(undefined, undefined, domain);
	const cleanup = vi.fn();
	registerComponentLifecycleHandler(owner, 'unmount', cleanup);
	owner.unmount('logical boundary removed');
	expect(cleanup).toHaveBeenCalledOnce();
	expect(cleanup.mock.calls[0]?.[0]).toMatchObject({ reason: 'logical boundary removed' });
	owner.unmount();
	expect(cleanup).toHaveBeenCalledOnce();
});

it('keeps structural lifecycle owners out of application resumption records', () => {
	const resume = vi.fn(() => {
		throw new Error('No application activation belongs to a structural owner');
	});
	const domain = createFrameworkComponentDomain({
		executionRoot: 'logical-owner-test',
		resumeComponent: resume
	});
	const owner = withComponentResumption(domain, () =>
		createFrameworkLogicalOwner(undefined, undefined, domain)
	);
	try {
		expect(resume).not.toHaveBeenCalled();
		expect(owner.state).toEqual({});
	} finally {
		owner.unmount();
	}
});
