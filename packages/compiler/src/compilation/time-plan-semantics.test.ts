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

const cases = [
	{
		name: 'key inside a clock-bearing enhancement spread',
		enhancementSpread: true,
		policySpread: true,
		prelude:
			'const attributes={key:"clock","time:update":props.update,"data-clock":Math.floor((Date.now()-props.anchor)/1000),className:Math.floor((Date.now()-props.anchor)/1000)>1?"clock elapsed":"clock"};',
		attributes: ' {...attributes}',
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'reactive policy in an enhancement-bearing clock spread',
		enhancementSpread: true,
		policySpread: true,
		prelude:
			'const attributes={"time:update":props.update,"data-clock":Math.floor((Date.now()-props.anchor)/1000),className:Math.floor((Date.now()-props.anchor)/1000)>1?"clock elapsed":"clock"};',
		attributes: ' key="clock" {...attributes}',
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	...(['floor', 'round', 'trunc'] as const).map((rounding) => ({
		name: `epoch ${rounding} without an explicit anchor`,
		expression: `Math.${rounding}(Date.now()/1000)`,
		expected: (now: number) => Math[rounding](now / 1000)
	})),
	{
		name: 'setup alias for clock spread',
		policy: 'millisecond',
		prelude:
			'const attributes={"data-clock":Math.floor((Date.now()-props.anchor)/1000),className:Math.floor((Date.now()-props.anchor)/1000)>1?"clock elapsed":"clock"};',
		attributes: ' {...attributes}',
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'enhancement-bearing clock spread',
		enhancementSpread: true,
		prelude:
			'const attributes={"time:update":"millisecond" as const,"data-clock":Math.floor((Date.now()-props.anchor)/1000),className:Math.floor((Date.now()-props.anchor)/1000)>1?"clock elapsed":"clock"};',
		attributes: ' {...attributes}',
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'clock spread overwrite order',
		policy: 'millisecond',
		attributes:
			' {...{"data-clock":-1,className:"wrong"}} {...{"data-clock":Math.floor((Date.now()-props.anchor)/1000)}} className={Math.floor((Date.now()-props.anchor)/1000)>1?"clock elapsed":"clock"}',
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'static spread with direct clock properties',
		attributes:
			' {...{title:"static"}} data-clock={Math.floor((Date.now()-props.anchor)/1000)} className={Math.floor((Date.now()-props.anchor)/1000)>1?"clock elapsed":"clock"}',
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'clock-dependent spread values',
		policy: 'millisecond',
		attributes:
			' {...{"data-clock":Math.floor((Date.now()-props.anchor)/1000),className:Math.floor((Date.now()-props.anchor)/1000)>1?"clock elapsed":"clock"}}',
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'clock-dependent spread keys',
		policy: 'millisecond',
		dynamicSpread: true,
		attributes:
			' {...{...(Math.floor((Date.now()-props.anchor)/1000)>1?{"data-late":"active"}:{"data-early":"active"}),"data-clock":Math.floor((Date.now()-props.anchor)/1000),className:Math.floor((Date.now()-props.anchor)/1000)>1?"clock elapsed":"clock"}}',
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'independent nested provider clocks and disabled range',
		nested: true,
		expression: 'Math.floor((Date.now()-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'direct prop anchor',
		setup: 'this.state.offset=0;',
		attributes:
			' data-clock={Math.floor((Date.now()-props.anchor+this.state.offset)/1000)} className="clock" className:elapsed={Math.floor((Date.now()-props.anchor)/1000)>1}',
		prelude: '',
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'chained anchor',
		prelude: 'const original=props.anchor;const anchor=original;',
		expression: 'Math.floor((Date.now()-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'destructured anchor',
		prelude: 'const {anchor}=props;',
		expression: 'Math.floor((Date.now()-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'destructured clock value',
		prelude: 'const reading={now:Date.now()};const {now}=reading;const anchor=props.anchor;',
		expression: 'Math.floor((now-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'explicit accuracy for shifted helper clock argument',
		policy: 'millisecond',
		prelude:
			'const anchor=props.anchor;function elapsed(now:number,start:number){return Math.floor((now-start)/1000);}',
		expression: 'elapsed(Date.now()-500,anchor)',
		expected: (now: number, anchor = 1250) => Math.floor((now - 500 - anchor) / 1000)
	},
	{
		name: 'destructured array clock',
		prelude: 'const reading=[Date.now()];const [now]=reading;const anchor=props.anchor;',
		expression: 'Math.floor((now-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'nested destructured clock',
		prelude:
			'const reading={nested:{now:Date.now()}};const {nested:{now}}=reading;const anchor=props.anchor;',
		expression: 'Math.floor((now-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'chained clock alias',
		prelude: 'const initial=Date.now();const now=initial;const anchor=props.anchor;',
		expression: 'Math.floor((now-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'explicit accuracy for scaled helper clock argument',
		policy: 'millisecond',
		prelude:
			'const anchor=props.anchor;function elapsed(now:number,start:number){return Math.floor((now-start)/1000);}',
		expression: 'elapsed(Date.now()*2,anchor)',
		expected: (now: number, anchor = 1250) => Math.floor((now * 2 - anchor) / 1000)
	},
	{
		name: 'raw helper clock argument',
		prelude:
			'const anchor=props.anchor;function elapsed(now:number,start:number){return Math.floor((now-start)/1000);}',
		expression: 'elapsed(Date.now(),anchor)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'floor increasing',
		expression: 'Math.floor((Date.now()-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'ceil decreasing',
		expression: 'Math.ceil((anchor-Date.now())/1000)',
		expected: (now: number, anchor = 1250) => Math.ceil((anchor - now) / 1000)
	},
	{
		name: 'round increasing',
		expression: 'Math.round((Date.now()-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.round((now - anchor) / 1000)
	},
	{
		name: 'threshold changes cadence',
		expression:
			'Math.floor((Date.now()-anchor)/1000)<2?Math.floor((Date.now()-anchor)/1000):Math.floor((Date.now()-anchor)/60000)',
		expected: (now: number, anchor = 1250) =>
			Math.floor((now - anchor) / 1000) < 2
				? Math.floor((now - anchor) / 1000)
				: Math.floor((now - anchor) / 60000)
	}
];
it.each(cases.flatMap((entry) => ['mount', 'hydrate'].map((mode) => ({ ...entry, mode }))))(
	'preserves compiled time plan semantics: $name ($mode)',
	async ({
		expression,
		expected,
		prelude,
		policy,
		attributes,
		setup,
		mode,
		nested,
		dynamicSpread,
		enhancementSpread,
		policySpread
	}) => {
		registerDomEnhancementIntegration();
		const root = await createTestWorkspace('.exact-time-plan-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};import {TimeProvider} from '@exactjs/time';import type {Component} from '@exactjs/core';export {TimeProvider};import TimeUpdate from '@exactjs/time/enhancements';export {TimeUpdate};
import {createManualTimeClock} from '@exactjs/time/testing';export const clock=createManualTimeClock(2750);export const nestedClock=createManualTimeClock(8750);export {registerDomEnhancementIntegration} from '@exactjs/dom/framework/enhancements';
export function Shell(this:Component<{}>,props:{children:import('@exactjs/core').Child}){return()=> <html><head/><body><main id="application">{props.children}</main></body></html>;}
export function App(this:Component<{anchor:number;policy:"millisecond"|"disabled"}>){this.state.anchor=1250;this.state.policy="millisecond";return()=> <main><button onClick={()=>this.state.anchor=4250}>Change anchor</button><button data-policy onClick={()=>this.state.policy=this.state.policy==="disabled"?"millisecond":"disabled"}>Toggle</button><Page anchor={this.state.anchor} update={this.state.policy}/></main>;}
export function Page(this:Component<{offset:number}>,props:{anchor:number;update:"millisecond"|"disabled"}){${setup ?? ''}${prelude ?? 'const anchor=props.anchor;'}return()=> <TimeProvider clock={clock}><time${attributes ?? ''} ${enhancementSpread ? '' : 'time:update'}${policy ? `="${policy}"` : ''}>{${expression}}</time>${nested ? `<TimeProvider clock={nestedClock}><time data-nested time:update>{${expression}}</time><time data-frozen time:update="disabled">{${expression}}</time></TimeProvider>` : ''}</TimeProvider>;}`
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
		if (attributes) {
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
		for (const sample of [2999, 3000, 3249, 3250, 3749, 3750, 61249, 61250].filter(
			(value) => value >= now
		)) {
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
			if (attributes) {
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
