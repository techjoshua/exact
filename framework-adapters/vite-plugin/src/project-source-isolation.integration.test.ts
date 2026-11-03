import { verifyComponentCallableInputs } from '../../test-support/component-callable-input-contract.js';
import { verifySelectedModulePartition } from '../../test-support/selected-module-partition.js';
import { it } from 'vitest';
import { verifyReassignedCallableModules } from '../../test-support/reassigned-callable-contract.js';
import {
	verifyProjectSourceIsolation,
	verifyProjectedModuleWrites
} from '../../test-support/project-source-isolation.js';

it(
	'preserves reassigned callable requirements in both artifacts',
	() => verifyReassignedCallableModules('vite'),
	60000
);

it(
	'isolates unrelated project initializers in both artifacts',
	() => verifyProjectSourceIsolation('vite'),
	60000
);

it(
	'preserves projected module writes in both artifacts',
	() => verifyProjectedModuleWrites('vite'),
	60000
);

it(
	'validates selected module initialization before partitioning',
	() => verifySelectedModulePartition('vite'),
	90000
);

it(
	'preserves invoked callable requirements and receiver semantics',
	() => verifyComponentCallableInputs('vite'),
	240000
);
