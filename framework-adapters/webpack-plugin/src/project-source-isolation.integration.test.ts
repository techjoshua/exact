import { verifySelectedModulePartition } from '../../test-support/selected-module-partition.js';
import { it } from 'vitest';
import { verifyReassignedCallableModules } from '../../test-support/reassigned-callable-contract.js';
import {
	verifyProjectSourceIsolation,
	verifyProjectedModuleWrites
} from '../../test-support/project-source-isolation.js';

it(
	'preserves reassigned callable requirements in both artifacts',
	() => verifyReassignedCallableModules('webpack'),
	60000
);

it(
	'isolates unrelated project initializers in both artifacts',
	() => verifyProjectSourceIsolation('webpack'),
	60000
);

it(
	'preserves projected module writes in both artifacts',
	() => verifyProjectedModuleWrites('webpack'),
	60000
);

it(
	'validates selected module initialization before partitioning',
	() => verifySelectedModulePartition('webpack'),
	90000
);
