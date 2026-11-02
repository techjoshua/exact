import { it } from 'vitest';
import {
	verifyProjectSourceIsolation,
	verifyProjectedModuleWrites
} from '../../test-support/project-source-isolation.js';

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
