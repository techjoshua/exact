import { render, dispose } from '@exactjs/dom';
import { flushSync, unwrap, watch } from '@exactjs/reactive';
import { it } from 'vitest';
import {
	assignmentIdentityRoot,
	assignmentIdentityOwner
} from './scenarios/assignment-identity.fixtures.js';
import {
	verifyAuthoredAssignment,
	authoredAssignmentValues
} from '../test-support/authored-assignment-journey.mjs';

it.each(authoredAssignmentValues)(
	'stores the RHS of authored indexed and general assignments (%s)',
	(value) => {
		verifyAuthoredAssignment(
			{
				assignmentIdentityRoot,
				owner: () => assignmentIdentityOwner,
				flushSync,
				unwrap,
				watch,
				mount: (root, container, onErrorReport) => {
					render(root, container, { onErrorReport });
					return container;
				},
				release: (container) => dispose(container, true)
			},
			value
		);
	}
);
