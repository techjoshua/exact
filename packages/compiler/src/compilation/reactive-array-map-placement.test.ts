/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { createExactClient, readExactHydrationConfig } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createBrowserTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

it('keeps native map receiver effects and reactive updates in application and library artifacts', async () => {
	const root = await createBrowserTestWorkspace('.exact-reactive-map-', process.cwd());
	const files = await writeTestFiles(root, {
		'producer.ts': 'export function double(value: number) { return value * 2; }',
		'page.tsx': `
import type { Component } from '@exactjs/core';
import { double } from './producer.js';
export function Portable(this: Component<{ offset: number }>, props: { value: number }) {
	this.state.offset = 1;
	const key = 'map' as const;
	const indexed = this.reactive(() => [props.value][key](value => value + this.state.offset, () => document.title)[0]);
	const joined = this.reactive(() => [props.value].map(double).join());
	const empty = this.reactive(() => ([] as number[]).map(() => document.title, props).length);
	return () => <output data-portable>{indexed.get()}:{joined.get()}:{empty.get()}</output>;
}
export function Browser(this: Component<{}>, props: { value: number }) {
	const receiver = {
		get title() { return this === receiver ? document.title : 'wrong receiver'; }
	};
	const value = this.reactive(() => [props.value].map(function(this: typeof receiver, item) {
		return this.title + item;
	}, receiver)[0]);
	return () => <output data-browser>{value.get()}</output>;
}
export function Page(this: Component<{ value: number }>) {
	this.state.value = 41;
	return () => <main>
		<button onClick={() => this.state.value++}>Next</button>
		<Portable value={this.state.value}/>
		<Browser value={this.state.value}/>
	</main>;
}
`
	});
	const previousTitle = document.title;
	onTestFinished(() => {
		document.title = previousTitle;
	});
	document.title = 'client:';
	let applicationCode: readonly string[] | undefined;
	for (const packageType of ['application', 'library'] as const) {
		const outDir = path.join(root, packageType);
		const artifacts = await compileProjectArtifacts([files['page.tsx']!, files['producer.ts']!], {
			rootDir: root,
			outDir,
			packageType,
			serverComponents: true,
			generatedValidation: 'semantic'
		});
		const entry = artifacts.find((artifact) => artifact.inputFile === files['page.tsx'])!;
		for (const [exportName, placement, artifactTargets] of [
			['Portable', 'isomorphic', ['client', 'server']],
			['Browser', 'client', ['client']]
		] as const) {
			const exposed = entry.build.exposureRoots.find((root) => root.exportName === exportName);
			expect(
				entry.build.componentBuild.components.find((row) => row.id === exposed?.componentId)
			).toMatchObject({ placement, artifactTargets });
		}
		const code = [entry.client.code, entry.server.code];
		if (applicationCode) expect(code).toEqual(applicationCode);
		applicationCode = code;
		const graph = createExactArtifactGraph(artifacts, {
			packageRoot: root,
			sourceRoot: root,
			rootDir: outDir
		});
		const registrationFile = await writeTestFiles(outDir, {
			'registration.ts': createExactHydrationRegistrationModule(graph)
		});
		const server = await importArtifact(entry.serverFile, path.join(outDir, 'server.mjs'));
		const registration = (
			await importArtifact(
				registrationFile['registration.ts']!,
				path.join(outDir, 'registration.mjs')
			)
		).exactHydrationRegistration as Parameters<typeof createExactClient>[1];
		const html = await renderToHydratableString(receipt(server.Page as AnyComponentFunction, {}));
		const host = document.createElement('div');
		host.innerHTML = html.htmlWithHydration;
		const portable = host.querySelector('[data-portable]');
		const button = host.querySelector('button')!;
		expect(portable?.textContent, packageType).toBe('42:82:0');
		expect(host.querySelector('[data-browser]')).toBeNull();

		const reports: unknown[] = [];
		const view = createExactClient(host, {
			...readExactHydrationConfig(host),
			...registration,
			onMismatch: 'throw',
			onErrorReport: (report) => reports.push(report.error)
		});
		try {
			await view.whenSettled();
			const browser = host.querySelector('[data-browser]');
			expect(browser?.textContent).toBe('client:41');
			for (const value of [42, 43]) {
				button.click();
				flushSync();
				await view.whenSettled();
				expect(host.querySelector('button')).toBe(button);
				expect(host.querySelector('[data-portable]')).toBe(portable);
				expect(host.querySelector('[data-browser]')).toBe(browser);
				expect(portable?.textContent).toBe(`${value + 1}:${2 * value}:0`);
				expect(browser?.textContent).toBe(`client:${value}`);
			}
			expect(reports).toEqual([]);
		} finally {
			view.dispose();
		}
	}
});
