import { expect, it, vi } from 'vitest';
import { createFrameworkComponentDomain, withComponentResumption } from './domain.js';
import { createFrameworkLogicalOwner } from './logical-owner.js';

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
