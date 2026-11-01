import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Copies the shared authored DOM fixture and its page into the existing temporary graph. */
export async function copyMountWorkFixture(root, temporary, fixture, controlOrigin) {
	await writeFile(
		path.join(temporary, 'mount-work.fixtures.tsx'),
		await readFile(
			path.join(root, 'packages/dom/src/test-support/roots/mount-work.fixtures.tsx'),
			'utf8'
		)
	);
	const pageFile = path.join(temporary, 'Page.tsx');
	await writeFile(
		pageFile,
		(await readFile(path.join(fixture, 'Page.tsx'), 'utf8')).replaceAll(
			'__EXACT_CONTROL__',
			controlOrigin
		)
	);
	return pageFile;
}

/** Finds the paired fixture in the already compiled authored page graph. */
export function mountWorkArtifact(pages) {
	const artifact = pages.find((entry) => entry.inputFile.endsWith('mount-work.fixtures.tsx'));
	assert.ok(artifact, 'Missing mount work fixture artifact');
	return artifact;
}

/** Exposes observations from the same fixture module used by the hydrated page. */
export function mountWorkClientSource(artifact) {
	return `import {workOwner,workRef,workScope,workReleases,workReleasedOwners} from ${JSON.stringify(artifact.clientFile)};
window.readMountWork=()=>({owner:workOwner,ref:workOwner?.refs.get(workRef),active:workScope?.active,releases:workReleases.length,releasedOwners:workReleasedOwners});`;
}

/** Saves the parsed server template before the existing client bootstrap runs. */
export async function captureMountWorkServerTemplate(page) {
	await page.evaluate(() => {
		window.originalServerWorkTemplate = document.querySelector('template');
	});
}

/** Captures the settled owner while requiring adoption of the actual parsed server template. */
export async function captureMountWork(page, route) {
	await page.waitForFunction(() => typeof window.readMountWork === 'function');
	assert.deepEqual(
		await page.evaluate(() => {
			const work = window.readMountWork();
			window.originalMountWork = { owner: work.owner, ref: work.ref, releases: work.releases };
			const middle = work.ref?.content.querySelector('template');
			const inner = middle?.content.querySelector('template');
			return {
				hasRef: work.ref instanceof HTMLTemplateElement,
				sameServerTemplate: work.ref === window.originalServerWorkTemplate,
				text: inner?.content.textContent,
				active: work.active,
				ownerReleases: work.releasedOwners.filter((owner) => owner === work.owner).length
			};
		}),
		{ hasRef: true, sameServerTemplate: true, text: 'text', active: true, ownerReleases: 0 },
		route
	);
}

/** Checks that ordinary page updates preserve the captured fixture ownership. */
export async function verifyRetainedMountWork(page) {
	await page.evaluate(() => {
		const work = window.readMountWork();
		if (
			work.owner !== window.originalMountWork.owner ||
			work.ref !== window.originalMountWork.ref ||
			!work.active ||
			work.releasedOwners.includes(work.owner)
		)
			throw new Error('Lost retained mount-work ownership');
	});
}

/** Checks ref release and component disposal after the existing root owner is disposed. */
export async function verifyDisposedMountWork(page) {
	await page.evaluate(() => {
		const work = window.readMountWork();
		const original = window.originalMountWork;
		if (
			work.owner !== original.owner ||
			work.ref ||
			work.active ||
			work.releases !== original.releases + 1 ||
			work.releasedOwners.filter((owner) => owner === original.owner).length !== 1
		)
			throw new Error('Leaked mount-work ownership');
	});
}
