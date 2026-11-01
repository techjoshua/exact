import path from 'node:path';
import { expect, it } from 'vitest';
import { writePairedTestHelpers } from '../../../../framework-adapters/test-support/paired-test-helpers.js';
import { exactTestHelperTarget } from './test-helper-target.js';
import { transformSource } from './transformation.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';

it('selects server-only helpers without changing production placement or client component ownership', async () => {
	const root = await createCompilerTestWorkspace('paired-target-', path.resolve('.tmp'));
	const { filename, source } = await writePairedTestHelpers(root);
	const options = { filename, root, serverComponents: true, preserveOrdinaryModules: true };
	expect(exactTestHelperTarget(source, options, 'client')).toBe('server');
	expect(exactTestHelperTarget(source, options, 'server')).toBe('server');
	// Production still removes a server export from client output.
	expect(transformSource(source, { ...options, target: 'client' }).code).not.toContain(
		'export function serverFixture'
	);
	expect(transformSource(source, { ...options, target: 'server' }).code).toContain(
		'export function serverFixture'
	);
	expect(exactTestHelperTarget('export function ordinary(){return 1;}', options, 'client')).toBe(
		'client'
	);
	expect(
		exactTestHelperTarget(
			source + '\nexport function Local(){return()=> <button/>;}',
			options,
			'client'
		)
	).toBe('client');
	expect(
		exactTestHelperTarget(
			source + '\n/** @exact client */ export function Browser(){return()=> <button/>;}',
			options,
			'client'
		)
	).toBe('client');
});
