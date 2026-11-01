import type {
	assignmentListOwner,
	assignmentListLifecycle
} from '../src/scenarios/assignment-list.fixtures.js';
import type { hydrate } from '@exactjs/hydrate';

/** Paired SSR payload consumed by the shared strict adoption journey. */
export type AssignmentListServer = {
	html: string;
	resumptions?: NonNullable<Parameters<typeof hydrate>[2]>['resumptions'];
};
/** Checks the same authored list contract in source and Chromium package graphs. */
export function verifyAssignmentList(
	api: Pick<typeof import('@exactjs/reactive'), 'flushSync' | 'watch' | 'unwrap'> & {
		owner: () => typeof assignmentListOwner;
		lifecycle: typeof assignmentListLifecycle;
		start: (
			container: HTMLElement,
			retained: boolean,
			server: AssignmentListServer | undefined,
			report: (value: unknown) => void
		) => void | Promise<void>;
		release: (container: HTMLElement) => void;
	},
	retained: boolean,
	server?: AssignmentListServer
): Promise<{
	retained: boolean;
	hydrated: boolean;
	mounts: number;
	unmounts: number;
	reports: number;
}>;
