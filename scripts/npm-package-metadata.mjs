/**
 * Validates npm discovery and support metadata without importing generated package outputs.
 * Metadata must be authored in the source manifest rather than inferred during publication.
 */
export function validateNpmPackageMetadata({ manifest, relativePath }) {
	const problems = [];
	if (typeof manifest.description !== 'string' || !manifest.description.trim())
		problems.push('description must be explicit and nonempty');
	const keywords = manifest.keywords;
	if (
		!Array.isArray(keywords) ||
		keywords.length < 2 ||
		keywords.some((word) => typeof word !== 'string' || !word.trim() || word !== word.trim()) ||
		new Set(keywords).size !== keywords.length ||
		!keywords.includes('exactjs')
	)
		problems.push('keywords must include exactjs and distinct, nonempty package-specific terms');
	const directory = relativePath.replace(/\/package\.json$/, '');
	if (
		manifest.repository?.type !== 'git' ||
		manifest.repository?.url !== 'git+https://github.com/techjoshua/exact.git' ||
		manifest.repository?.directory !== directory
	)
		problems.push('repository must identify the Git repository and this package directory');
	if (
		typeof manifest.homepage !== 'string' ||
		!/^https:\/\/techjoshua\.github\.io\/exact\/#\/[a-z0-9/-]+$/.test(manifest.homepage)
	)
		problems.push('homepage must link to the relevant public documentation page');
	if (manifest.bugs?.url !== 'https://github.com/techjoshua/exact/issues')
		problems.push('bugs.url must link to the framework issue tracker');
	if (manifest.license !== 'Apache-2.0' || manifest.author !== 'Joshua Friesen')
		problems.push('license and author must identify the framework distribution');
	return problems.map((problem) => `${manifest.name}: ${problem}`);
}
