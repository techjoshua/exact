import { describe, expect, it } from 'vitest';
import { resolveExactNodePackage } from './resolved-package.js';

describe('resolved Node package provenance', () => {
	it('finds a package boundary even when package.json is not publicly exported', async () => {
		const resolved = await resolveExactNodePackage(process.cwd(), '@exactjs/intl');
		expect(resolved.name).toBe('@exactjs/intl');
		expect(resolved.manifest.name).toBe('@exactjs/intl');
		expect(resolved.manifestPath.endsWith('package.json')).toBe(true);
	});
});

it('retains ordinary result and manifest aliases without changing a subsequent resolution', async () => {
	const first = await resolveExactNodePackage(process.cwd(), '@exactjs/intl');
	const original = first.version;
	const resultAlias: { version: string } = first;
	const manifestAlias: Record<string, unknown> = first.manifest;
	resultAlias.version = 'observed-version';
	manifestAlias.name = 'observed-name';
	const next = await resolveExactNodePackage(process.cwd(), '@exactjs/intl');
	expect(first.version).toBe('observed-version');
	expect(next.version).toBe(original);
	expect(next.manifest.name).toBe('@exactjs/intl');
});
