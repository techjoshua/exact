import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync, unwrap, watch } from '@exactjs/reactive';
import { it } from 'vitest';
import {
	assignmentListRoot,
	assignmentListOwner,
	assignmentListLifecycle
} from './scenarios/assignment-list.fixtures.js';
import { assignmentListRoot as serverRoot } from './scenarios/assignment-list.fixtures.js?exact-target=server';
import { verifyAssignmentList } from '../test-support/assignment-list-journey.mjs';

for (const retained of [false, true])
	for (const entry of ['mount', 'hydrate'])
		it(`retains authored keyed children: ${entry}, retained=${retained}`, async () => {
			let hydrated: ReturnType<typeof hydrate> | undefined;
			const server =
				entry === 'hydrate' ? await renderToHydratableString(serverRoot(retained)) : undefined;
			await verifyAssignmentList(
				{
					owner: () => assignmentListOwner,
					lifecycle: assignmentListLifecycle,
					flushSync,
					unwrap,
					watch,
					async start(container, retained, server, onErrorReport) {
						if (server) {
							hydrated = hydrate(assignmentListRoot(retained), container, {
								resumptions: server.resumptions,
								onMismatch: 'throw',
								onErrorReport,
								onDiagnostic: onErrorReport
							});
							await hydrated.whenSettled();
						} else render(assignmentListRoot(retained), container, { onErrorReport });
					},
					release: (container) => {
						hydrated?.dispose();
						dispose(container, true);
					}
				},
				retained,
				server
			);
		});
