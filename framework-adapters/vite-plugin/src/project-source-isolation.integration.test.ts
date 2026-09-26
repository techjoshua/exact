import { it } from 'vitest';
import { verifyProjectSourceIsolation } from '../../test-support/project-source-isolation.js';

it(
	'isolates unrelated project initializers in both artifacts',
	() => verifyProjectSourceIsolation('vite'),
	60000
);
