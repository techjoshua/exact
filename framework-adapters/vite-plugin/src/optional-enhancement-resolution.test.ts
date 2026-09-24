import { expect, it } from 'vitest';
import { isMissingOptionalEnhancement } from './optional-enhancement-resolution.js';

it('accepts only resolution failures for the requested optional module', () => {
	const error = (message: string, code = 'MODULE_NOT_FOUND') =>
		Object.assign(new Error(message), { code });
	expect(isMissingOptionalEnhancement(error("Cannot find module '@ui/tone'"), '@ui/tone')).toBe(
		true
	);
	expect(
		isMissingOptionalEnhancement(
			error("Cannot find package '@ui/tone' imported from /app.js", 'ERR_MODULE_NOT_FOUND'),
			'@ui/tone'
		)
	).toBe(true);
	for (const failure of [
		error("Cannot find module '/app/node_modules/@ui/tone/missing.js'"),
		error("Cannot find module 'nested-dependency'"),
		error('Invalid exports in @ui/tone', 'ERR_INVALID_PACKAGE_CONFIG'),
		new Error("Cannot find module '@ui/tone'")
	])
		expect(isMissingOptionalEnhancement(failure, '@ui/tone')).toBe(false);
});
