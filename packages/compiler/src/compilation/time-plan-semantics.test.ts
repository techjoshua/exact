/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToHydratableString } from '@exactjs/ssr';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import type { HydrationRoot } from '../../../hydrate/src/types.js';
import { hydrate } from '../../../hydrate/src/index.js';
import { registerDomEnhancementIntegration } from '../../../dom/src/renderer/enhancement-integration.js';
import { flushSync } from '@exactjs/reactive';
import type { ManualTimeClock } from '@exactjs/time/testing';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

import { timePlanCases as cases } from '../test-support/time-plan-cases.js';

it.each(cases.flatMap((entry) => ['mount', 'hydrate'].map((mode) => ({ ...entry, mode }))))(
	'preserves compiled time plan semantics: $name ($mode)',
	async ({
		expression,
		expected,
		prelude,
		modulePrelude,
		policy,
		policyExpression,
		attributes,
		setup,
		mode,
		nested,
		dynamicSpread,
		enhancementSpread,
		policySpread,
		childComponent,
		omitReceiver
	}) => {
		registerDomEnhancementIntegration();
		const root = await createTestWorkspace('.exact-time-plan-', process.cwd());
		const files = await writeTestFiles(root, {
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					module: 'esnext',
					moduleResolution: 'bundler',
					target: 'es2022',
					lib: ['esnext', 'dom'],
					jsx: 'preserve',
					skipLibCheck: true
				},
				include: ['*.tsx']
			}),
			'page.tsx': `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};import {TimeProvider} from '@exactjs/time';import type {Component} from '@exactjs/core';export {TimeProvider};import TimeUpdate from '@exactjs/time/enhancements';export {TimeUpdate};
import {createManualTimeClock} from '@exactjs/time/testing';export const clock=createManualTimeClock(2750);export const nestedClock=createManualTimeClock(8750);export {registerDomEnhancementIntegration} from '@exactjs/dom/framework/enhancements';
${modulePrelude ?? ''}
export function Shell(this:Component<{}>,props:{children:import('@exactjs/core').Child}){return()=> <html><head/><body><main id="application">{props.children}</main></body></html>;}
export function App(this:Component<{anchor:number;policy:"millisecond"|"disabled"}>){this.state.anchor=1250;this.state.policy="millisecond";return()=> <main><button onClick={()=>this.state.anchor=4250}>Change anchor</button><button data-policy onClick={()=>this.state.policy=this.state.policy==="disabled"?"millisecond":"disabled"}>Toggle</button><Page anchor={this.state.anchor} update={this.state.policy}/></main>;}
function ClockView(props:{value:number}){return()=> <time>{props.value}</time>;}
export function Page(${omitReceiver ? '' : 'this:Component<{offset:number}>,'}props:{anchor:number;update:"millisecond"|"disabled"}){${setup ?? ''}${prelude ?? 'const anchor=props.anchor;'}return()=> <TimeProvider clock={clock}>${childComponent ? '<span time:update>' : ''}<${childComponent ? 'ClockView' : 'time'}${attributes ?? ''} ${enhancementSpread || childComponent ? '' : 'time:update'}${policyExpression ? `={${policyExpression}}` : policy ? `="${policy}"` : ''}>${childComponent ? '' : `{${expression}}`}</${childComponent ? 'ClockView' : 'time'}>${childComponent ? '</span>' : ''}${nested ? `<TimeProvider clock={nestedClock}><time data-nested time:update>{${expression}}</time><time data-frozen time:update="disabled">{${expression}}</time></TimeProvider>` : ''}</TimeProvider>;}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'), {
			'@exactjs/time': path.resolve('packages/time/dist/client/index.js'),
			'@exactjs/time/internal': path.resolve('packages/time/dist/client/internal.js'),
			'@exactjs/time/enhancements': path.resolve('packages/time/dist/client/enhancements.js'),
			'@exactjs/time/testing': path.resolve('packages/time/dist/client/testing.js')
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'), {
			'@exactjs/time': path.resolve('packages/time/dist/server/index.js'),
			'@exactjs/time/internal': path.resolve('packages/time/dist/server/internal.js'),
			'@exactjs/time/enhancements': path.resolve('packages/time/dist/server/enhancements.js'),
			'@exactjs/time/testing': path.resolve('packages/time/dist/server/testing.js')
		});
		const rendered = await renderToHydratableString(receipt(server.App as never, {}), {
			documentShell: (child) => receipt(server.Shell as never, { children: child }),
			enhancementCatalog: new Map([
				['@exactjs/time/enhancements#default', server.TimeUpdate as AnyComponentFunction]
			])
		});
		const serverHost = document.createElement('div');
		serverHost.innerHTML = rendered.html;
		expect(serverHost.querySelector('time')?.textContent, 'server clock sample').toBe(
			String(expected(2750))
		);
		if (attributes && !childComponent) {
			expect(serverHost.querySelector('time')?.getAttribute('data-clock')).toBe('1');
			expect(serverHost.querySelector('time')?.className).toBe('clock');
			if (dynamicSpread) {
				expect(serverHost.querySelector('time')?.getAttribute('data-early')).toBe('active');
				expect(serverHost.querySelector('time')?.hasAttribute('data-late')).toBe(false);
			}
		}
		(client.registerDomEnhancementIntegration as () => void)();
		const clock = client.clock as ManualTimeClock;
		const nestedClock = client.nestedClock as ManualTimeClock;
		const host = document.createElement('div');
		let hydrationRoot: HydrationRoot | undefined;
		onTestFinished(() => {
			hydrationRoot?.dispose();
			unmount(host);
		});
		const reports: unknown[] = [];
		const options = {
			enhancementCatalog: new Map([
				['@exactjs/time/enhancements#default', client.TimeUpdate as AnyComponentFunction]
			]),
			onErrorReport: (r: { error: unknown }) => reports.push(r.error)
		};
		let adopted: HTMLTimeElement | null = null;
		if (mode === 'hydrate') {
			host.innerHTML = serverHost.querySelector('#application')!.innerHTML;
			adopted = host.querySelector('time');
			clock.advance(1000);
			if (nested) nestedClock.advance(1000);
			hydrationRoot = hydrate(receipt(client.App as never, {}), host, {
				...composeExactComponentContracts(
					[
						client.App,
						client.Page,
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
			expect(host.querySelector('time')).toBe(adopted);
			expect(adopted!.textContent, 'initial adoption uses provider server sample').toBe(
				String(expected(2750))
			);
			if (nested) {
				expect(host.querySelector('[data-nested]')!.textContent).toBe(String(expected(8750)));
				expect(host.querySelector('[data-frozen]')!.textContent).toBe(String(expected(8750)));
			}
		} else render(receipt(client.App as never, {}), host, options);
		await Promise.resolve();
		flushSync();
		const time = host.querySelector('time')!;
		const nestedTime = host.querySelector('[data-nested]');
		const frozenTime = host.querySelector('[data-frozen]');
		expect(reports, 'before clock publication').toEqual([]);
		if (adopted) expect(time).toBe(adopted);
		let now = mode === 'hydrate' ? 3750 : 2750;
		expect(time.textContent, 'current clock after settlement').toBe(String(expected(now)));
		for (const sample of [
			2999, 3000, 3249, 3250, 3251, 3749, 3750, 4250, 4251, 5249, 5250, 5251, 6249, 6250, 6251,
			7250, 7251, 8249, 8250, 8251, 60000, 61249, 61250
		].filter((value) => value >= now)) {
			clock.advance(sample - now);
			if (nested) {
				nestedClock.advance(sample - now);
				nestedClock.runDue();
			}
			now = sample;
			clock.runDue();
			flushSync();
			await Promise.resolve();
			expect(time.textContent, `sample=${sample}`).toBe(String(expected(sample)));
			if (attributes && !childComponent) {
				expect(time.getAttribute('data-clock')).toBe(String(Math.floor((sample - 1250) / 1000)));
				expect(time.classList.contains('elapsed')).toBe(Math.floor((sample - 1250) / 1000) > 1);
				if (dynamicSpread) {
					const late = Math.floor((sample - 1250) / 1000) > 1;
					expect(time.getAttribute(late ? 'data-late' : 'data-early')).toBe('active');
					expect(time.hasAttribute(late ? 'data-early' : 'data-late')).toBe(false);
				}
			}
			expect(host.querySelector('time')).toBe(time);
			if (nested) {
				expect(nestedTime!.textContent).toBe(String(expected(sample + 6000)));
				expect(frozenTime!.textContent).toBe(String(expected(8750)));
				expect(host.querySelector('[data-nested]')).toBe(nestedTime);
				expect(host.querySelector('[data-frozen]')).toBe(frozenTime);
			}
			const deadline = clock.nextDeadline?.epochMilliseconds;
			if (deadline !== undefined) expect(deadline).toBeGreaterThan(sample);
		}
		host.querySelector('button')!.click();
		flushSync();
		await Promise.resolve();
		expect(time.textContent, 'changed prop anchor').toBe(String(expected(now, 4250)));
		if (nested) {
			expect(nestedTime!.textContent).toBe(String(expected(now + 6000, 4250)));
			expect(frozenTime!.textContent).toBe(String(expected(8750, 4250)));
		}
		clock.advance(1000);
		if (nested) {
			nestedClock.advance(1000);
			nestedClock.runDue();
		}
		now += 1000;
		clock.runDue();
		flushSync();
		await Promise.resolve();
		expect(time.textContent, 'schedule after changed anchor').toBe(String(expected(now, 4250)));
		expect(host.querySelector('time')).toBe(time);
		if (policySpread) {
			const toggle = host.querySelector<HTMLButtonElement>('[data-policy]')!;
			toggle.click();
			flushSync();
			await Promise.resolve();
			expect(clock.pendingTimerCount, 'disabled spread policy releases scheduling').toBe(0);
			const frozen = time.textContent;
			clock.advance(1000);
			now += 1000;
			clock.runDue();
			flushSync();
			expect(time.textContent).toBe(frozen);
			toggle.click();
			flushSync();
			await Promise.resolve();
			expect(time.textContent, 're-enabled spread policy observes current clock').toBe(
				String(expected(now, 4250))
			);
			expect(host.querySelector('time')).toBe(time);
		}
		expect(reports).toEqual([]);
		hydrationRoot?.dispose();
		unmount(host);
		await Promise.resolve();
		expect(clock.pendingTimerCount).toBe(0);
		expect(nestedClock.pendingTimerCount).toBe(0);
		expect(host.childNodes).toHaveLength(0);
	}
);
