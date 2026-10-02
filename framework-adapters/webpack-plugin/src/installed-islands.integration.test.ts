import { it } from 'vitest';
import {
	verifyInstalledIslands,
	verifyInvalidInstalledIslands
} from '../../test-support/installed-islands-journey.js';

it.each([false, true])(
	'preserves independently installed split islands, streaming=%s',
	(stream) => verifyInstalledIslands('webpack', stream),
	60_000
);

it.each(['missing-facts', 'incompatible-facts', 'missing-client'] as const)(
	'rejects invalid installed split islands, fault=%s',
	(fault) => verifyInvalidInstalledIslands('webpack', fault),
	60_000
);
