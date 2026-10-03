/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { registerDomEnhancementIntegration } from '../../../dom/src/renderer/enhancement-integration.js';
import { hydrate } from '../../../hydrate/src/index.js';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { analyzeIntlSource } from '@exactjs/intl-analyzer';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it('preserves localized helper predicates, direction and amounts through updates and hydration', async () => {
	registerDomEnhancementIntegration();
	const root = await createTestWorkspace('.exact-intl-helper-semantics-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	const source = `import {type Component} from '@exactjs/core';
 export {registerDomEnhancementIntegration} from '@exactjs/dom/framework/enhancements';
 import IntlEnhancement from '@exactjs/intl/enhancements';export {IntlEnhancement};
 import {IntlProvider,createIntlEnvironment} from '@exactjs/intl';export {IntlProvider};
 const environment=createIntlEnvironment({locale:'en-US',descriptors:[]});
 type Duration={days:number;hours:number};
 /** @exact pure */
 function age(duration:Duration){const units=[{value:duration.days,unit:'day'},{value:duration.hours,unit:'hour'}] as const;const match=units.find(candidate=>candidate.value>5);if(!match)return 'just now';return new Intl.RelativeTimeFormat('en-US').format(Math.abs(match.value),match.unit);}
 /** @exact pure */
 function fixedAge(duration:Duration){const units=[{value:duration.days,unit:'day'},{value:duration.hours,unit:'hour'}] as const;const match=units.find(candidate=>candidate.value>5);if(!match)return 'just now';return new Intl.RelativeTimeFormat('en-US').format(42,match.unit);}
 export let owner:Component<{duration:Duration}>;
 export function Page(this:Component<{duration:Duration}>){owner=this;this.state.duration={days:2,hours:7};return()=> <IntlProvider environment={environment}><p intl:message>{age(this.state.duration)} / {fixedAge(this.state.duration)}</p></IntlProvider>;}`;
	const analysis = analyzeIntlSource(source, {
		filename: entry,
		owner: 'fixture',
		sourceLocale: 'en-US'
	});
	expect(analysis.diagnostics).toEqual([]);
	await writeFile(entry, analysis.code);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'), {
		'@exactjs/intl/internal': path.resolve('packages/intl/dist/server/internal.js'),
		'@exactjs/intl/enhancements': path.resolve('packages/intl/dist/server/enhancements.js'),
		'@exactjs/intl': path.resolve('packages/intl/dist/server/index.js')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'), {
		'@exactjs/intl/internal': path.resolve('packages/intl/dist/client/internal.js'),
		'@exactjs/intl/enhancements': path.resolve('packages/intl/dist/client/enhancements.js'),
		'@exactjs/intl': path.resolve('packages/intl/dist/client/index.js')
	});
	(client.registerDomEnhancementIntegration as () => void)();
	for (const mode of ['mount', 'hydrate'] as const) {
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		const reports: unknown[] = [];
		let original: Element | null = null;
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(receipt(server.Page as never, {}), {
				enhancementCatalog: new Map([
					['@exactjs/intl/enhancements#default', server.IntlEnhancement as AnyComponentFunction]
				]),
				logger: {
					log: (event) => {
						if (event.level === 'warn' || event.level === 'error') reports.push(event);
					}
				}
			});
			host.innerHTML = output.html;
			original = host.querySelector('p');
			hydrate(receipt(client.Page as never, {}), host, {
				...composeExactComponentContracts(
					[
						client.Page as AnyComponentFunction,
						client.IntlEnhancement as AnyComponentFunction,
						client.IntlProvider as AnyComponentFunction
					],
					'client'
				),
				enhancementCatalog: new Map([
					['@exactjs/intl/enhancements#default', client.IntlEnhancement as AnyComponentFunction]
				]),
				resumptions: output.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r.error)
			});
		} else
			render(receipt(client.Page as never, {}), host, {
				enhancementCatalog: new Map([
					['@exactjs/intl/enhancements#default', client.IntlEnhancement as AnyComponentFunction]
				]),
				onErrorReport: (r) => reports.push(r.error)
			});
		const paragraph = host.querySelector('p');
		expect(paragraph).not.toBeNull();
		if (original) expect(paragraph).toBe(original);
		expect(paragraph?.textContent, mode).toBe('in 7 hours / in 42 hours');
		const owner = client.owner as { state: { duration: { days: number; hours: number } } };
		owner.state.duration = { days: 9, hours: 0 };
		flushSync();
		expect(paragraph?.textContent).toBe('in 9 days / in 42 days');
		owner.state.duration = { days: 0, hours: 0 };
		flushSync();
		expect(paragraph?.textContent).toBe('just now / just now');
		expect(host.querySelector('p')).toBe(paragraph);
		expect(reports).toEqual([]);
		unmount(host);
		expect(host.childNodes).toHaveLength(0);
	}
});
