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
