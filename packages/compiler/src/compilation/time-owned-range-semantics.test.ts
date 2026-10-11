/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import type { AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from '../../../hydrate/src/index.js';
import { registerDomEnhancementIntegration } from '../../../dom/src/renderer/enhancement-integration.js';
import { verifyTimePlanOwnership } from '../../../component-composition-corpus/test-support/time-plan-journey.mjs';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(
	(['mount', 'hydrate'] as const).flatMap((mode) => [0, 1, 2].map((depth) => ({ mode, depth })))
)(
	'retires a conditional provider-owned time range ($mode, $depth forwarders)',
	async ({ mode, depth }) => {
		registerDomEnhancementIntegration();
		const root = await createTestWorkspace('.exact-time-owned-range-', process.cwd());
		let source = await readFile(
			'packages/component-composition-corpus/src/test-support/time-plan.fixtures.tsx',
			'utf8'
		);
		// Paired root hydration exercises full SSR adoption. Adapter fixtures exercise client islands.
		source = source.replace('@exact client', '');
		if (depth)
			source =
				`import type {Child} from '@exactjs/core';function Forwarder(props:{children:Child}){return()=>props.children;}\n` +
				source
					.replace(
						'<TimeProvider clock={clock}>',
						'<TimeProvider clock={clock}>' + '<Forwarder>'.repeat(depth)
					)
					.replace('</TimeProvider>', '</Forwarder>'.repeat(depth) + '</TimeProvider>');
		source += `export {TimeProvider};export {default as TimeUpdate} from "@exactjs/time/enhancements";
export function App(){return()=> <TimeWindowProbe/>;}
export function Shell(props:{children:import('@exactjs/core').Child}){return()=> <html><head/><body><main id="application">{props.children}</main></body></html>;}`;
		const files = await writeTestFiles(root, { 'page.tsx': source });
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const load = (target: 'client' | 'server') =>
			importArtifact(
				artifact![(target + 'File') as 'clientFile' | 'serverFile'],
				path.join(root, target + '.mjs'),
				{
					'@exactjs/time': path.resolve('packages/time/dist/' + target + '/index.js'),
					'@exactjs/time/internal': path.resolve('packages/time/dist/' + target + '/internal.js'),
					'@exactjs/time/enhancements': path.resolve(
						'packages/time/dist/' + target + '/enhancements.js'
					),
					'@exactjs/time/testing': path.resolve('packages/time/dist/' + target + '/testing.js')
				}
			);
		const client = await load('client');
		const host = document.createElement('main');
		const reports: unknown[] = [];
		const options = {
			enhancementCatalog: new Map([
				['@exactjs/time/enhancements#default', client.TimeUpdate as AnyComponentFunction]
			]),
			onErrorReport: (report: unknown) => reports.push(report)
		};
		let hydration: ReturnType<typeof hydrate> | undefined;
		try {
			if (mode === 'hydrate') {
				const server = await load('server');
				const rendered = await renderToHydratableString(receipt(server.App as never, {}), {
					documentShell: (child) => receipt(server.Shell as never, { children: child }),
					enhancementCatalog: new Map([
						['@exactjs/time/enhancements#default', server.TimeUpdate as AnyComponentFunction]
					])
				});
				const serverHost = document.createElement('div');
				serverHost.innerHTML = rendered.htmlWithHydration;
				host.innerHTML = serverHost.querySelector('#application')!.innerHTML;
				const adopted = host.querySelector('[data-clock-window]');
				hydration = hydrate(receipt(client.App as never, {}), host, {
					...composeExactComponentContracts(
						[
							client.App,
							client.TimeWindowProbe,
							client.TimeProvider,
							client.TimeUpdate
						] as AnyComponentFunction[],
						'client'
					),
					...options,
					resumptions: rendered.resumptions,
					hydrationTable: rendered.hydrationTable,
					state: rendered.state,
					wallClockSnapshot: rendered.wallClockSnapshot,
					markerlessRoot: true,
					allowMarkerless: true,
					onMismatch: 'throw'
				});
				await hydration.whenSettled();
				expect(host.querySelector('[data-clock-window]')).toBe(adopted);
			} else render(receipt(client.App as never, {}), host, options);
			await verifyTimePlanOwnership(host);
			expect(reports).toEqual([]);
		} finally {
			hydration?.dispose();
			unmount(host);
		}
	}
);
