import { it } from 'vitest';
import {
	verifyProjectSourceIsolation,
	verifyProjectedModuleWrites
} from '../../test-support/project-source-isolation.js';

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
