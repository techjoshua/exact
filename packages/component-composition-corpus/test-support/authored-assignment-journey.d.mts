import type {
	assignmentIdentityRoot,
	assignmentIdentityOwner
} from '../src/scenarios/assignment-identity.fixtures.js';

/** Verifies replacement, alias retention, observation and cleanup through an authored component. */
export function verifyAuthoredAssignment(
	api: Pick<typeof import('../../reactive/src/index.js'), 'watch' | 'flushSync' | 'unwrap'> & {
		assignmentIdentityRoot: typeof assignmentIdentityRoot;
		owner: () => typeof assignmentIdentityOwner;
		mount: (
			root: ReturnType<typeof assignmentIdentityRoot>,
			container: Element,
			report: (value: unknown) => void
		) => object;
		release: (container: Element, mounted: object) => void;
	},
	value: number,
	html?: string
): void;

/** Equal and changed values from the shared assignment case table. */
export const authoredAssignmentValues: readonly number[];
