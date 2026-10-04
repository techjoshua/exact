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

/** Inputs and expected observations for the shared provider journey. */
type TimePlanCase = {
	name: string;
	expression: string;
	expected: (now: number, anchor?: number) => number | string | boolean;
	prelude?: string;
	modulePrelude?: string;
	policy?: string;
	policyExpression?: string;
	attributes?: string;
	setup?: string;
	nested?: boolean;
	dynamicSpread?: boolean;
	enhancementSpread?: boolean;
	policySpread?: boolean;
	childComponent?: boolean;
};
/** Native Temporal supplies an independent value oracle for emitted clock plans. */
type Instant = {
	epochMilliseconds: number;
	since(other: Instant): Duration;
	until(other: Instant): Duration;
};
type Duration = {
	round(options: {
		smallestUnit: string;
		roundingMode: string;
		roundingIncrement: number;
		largestUnit?: string;
	}): {
		seconds: number;
	};
};
const temporal = Reflect.get(globalThis, 'Temporal') as {
	Now: { instant(): Instant };
	Instant: { fromEpochMilliseconds(value: number): Instant };
};
const DurationFormatter = Reflect.get(Intl, 'DurationFormat') as new (locale: string) => {
	format(value: { minutes: number; seconds: number }): string;
};
const temporalDeclaration = `declare const Temporal: {Now:{instant():Instant};Instant:{fromEpochMilliseconds(value:number):Instant}};
interface Instant {epochMilliseconds:number;since(other:Instant):Duration;until(other:Instant):Duration}
interface Duration {round(options:{smallestUnit:string;roundingMode:string;roundingIncrement:number;largestUnit?:string}):{seconds:number}};`;
const cases: TimePlanCase[] = [
	{
		name: 'empty literal clock key',
		prelude: 'const {[""]:now}={[""]:Date.now()};const anchor=props.anchor;',
		expression: 'Math.floor((now-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'numeric clock key uses native property spelling',
		prelude: 'const {1e21:now}={"1e+21":Date.now()};const anchor=props.anchor;',
		expression: 'Math.floor((now-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'reactive explicit accuracy without automatic quantization',
		policyExpression: 'props.update',
		policySpread: true,
		expression: 'Date.now()',
		expected: (now: number) => now
	},
	{
		name: 'spread explicit accuracy without automatic quantization',
		enhancementSpread: true,
		policySpread: true,
		prelude:
			'const attributes={"time:update":props.update,"data-clock":Math.floor((Date.now()-props.anchor)/1000),className:Math.floor((Date.now()-props.anchor)/1000)>1?"clock elapsed":"clock"};',
		attributes: ' {...attributes}',
		expression: 'Date.now()',
		expected: (now: number) => now
	},
	{
		name: 'literal computed clock record',
		prelude: 'const reading={["now"]:Date.now()};const {now}=reading;const anchor=props.anchor;',
		expression: 'Math.floor((now-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'literal computed anchor binding',
		prelude: 'const {["anchor"]:anchor}=props;',
		expression: 'Math.floor((Date.now()-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'nested clock record and array binding',
		prelude:
			'const reading={nested:[0,{now:Date.now()}]};const {nested:[,{now}]}=reading;const anchor=props.anchor;',
		expression: 'Math.floor((now-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'Temporal literal largest unit',
		modulePrelude: temporalDeclaration,
		prelude: 'const anchor=props.anchor;',
		expression:
			'Temporal.Now.instant().since(Temporal.Instant.fromEpochMilliseconds(anchor)).round({smallestUnit:"second",largestUnit:"minute",roundingMode:"halfEven",roundingIncrement:2}).seconds',
		expected: (now: number, anchor = 1250) =>
			temporal.Instant.fromEpochMilliseconds(now)
				.since(temporal.Instant.fromEpochMilliseconds(anchor))
				.round({
					smallestUnit: 'second',
					largestUnit: 'minute',
					roundingMode: 'halfEven',
					roundingIncrement: 2
				}).seconds
	},
	{
		name: 'literal computed formatter option key',
		expression:
			'new Intl.DateTimeFormat("en-US",{["second"]:"numeric",timeZone:"UTC"}).format(Date.now())',
		expected: (now: number) =>
			new Intl.DateTimeFormat('en-US', { second: 'numeric', timeZone: 'UTC' }).format(now)
	},
	{
		name: 'Date-valued helper anchor',
		prelude:
			'const anchor=props.anchor;function elapsed(start:Date,now:number){return Math.floor((now-start.getTime())/1000)}',
		expression: 'elapsed(new Date(anchor),Date.now())',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'immediately invoked helper parameters',
		expression: '((start:number,now:number)=>Math.floor((now-start)/1000))(anchor,Date.now())',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'reversed absolute comparison',
		expression: '2>Math.abs(Math.floor((Date.now()-anchor)/1000))?"inside":"outside"',
		expected: (now: number, anchor = 1250) =>
			2 > Math.abs(Math.floor((now - anchor) / 1000)) ? 'inside' : 'outside'
	},
	{
		name: 'negative reversed threshold',
		expression: '-2>=Math.floor((Date.now()-anchor)/1000)?"before":"after"',
		expected: (now: number, anchor = 1250) =>
			-2 >= Math.floor((now - anchor) / 1000) ? 'before' : 'after'
	},
	...(
		[
			'halfExpand',
			'trunc',
			'floor',
			'ceil',
			'expand',
			'halfCeil',
			'halfFloor',
			'halfTrunc',
			'halfEven'
		] as const
	).flatMap((roundingMode) =>
		(['since', 'until'] as const).map((method) => ({
			name: `Temporal ${method} ${roundingMode} increment`,
			modulePrelude: temporalDeclaration,
			prelude: 'const anchor=props.anchor;',
			expression: `Temporal.Now.instant().${method}(Temporal.Instant.fromEpochMilliseconds(anchor+5000)).round({smallestUnit:"second",roundingMode:"${roundingMode}",roundingIncrement:2}).seconds`,
			expected: (now: number, anchor = 1250) =>
				temporal.Instant.fromEpochMilliseconds(now)
					[method](temporal.Instant.fromEpochMilliseconds(anchor + 5000))
					.round({ smallestUnit: 'second', roundingMode, roundingIncrement: 2 }).seconds
		}))
	),
	...(['<', '<=', '>', '>='] as const).flatMap((operator) =>
		[0, 2].map((limit) => ({
			name: `absolute time window ${operator} ${limit}`,
			expression: `Math.abs(Math.floor((Date.now()-anchor)/1000))${operator}${limit}?"inside":"outside"`,
			expected: (now: number, anchor = 1250) => {
				const value = Math.abs(Math.floor((now - anchor) / 1000));
				const inside =
					operator === '<'
						? value < limit
						: operator === '<='
							? value <= limit
							: operator === '>'
								? value > limit
								: value >= limit;
				return inside ? 'inside' : 'outside';
			}
		}))
	),
	{
		name: 'short time formatter',
		expression:
			'new Intl.DateTimeFormat("en-US",{timeStyle:"short",timeZone:"UTC"}).format(Date.now())',
		expected: (now: number) =>
			new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(now)
	},
	{
		name: 'multi-field duration earliest boundary',
		expression:
			'new Intl.DurationFormat("en-US").format({minutes:Math.floor((Date.now()-anchor)/60000),seconds:Math.floor((Date.now()-anchor)/1000)})',
		expected: (now: number, anchor = 1250) =>
			new DurationFormatter('en-US').format({
				minutes: Math.floor((now - anchor) / 60000),
				seconds: Math.floor((now - anchor) / 1000)
			})
	},

	...['keyed', 'unkeyed'].map((key) => ({
		name: `component ${key} prop copy under provider`,
		childComponent: true,
		attributes: ` {...{${key === 'keyed' ? 'key:"clock",' : ''}value:Math.floor((Date.now()-props.anchor)/1000)}}`,
		expression: 'Math.floor((Date.now()-props.anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	})),
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
		childComponent
	}) => {
		registerDomEnhancementIntegration();
		const root = await createTestWorkspace('.exact-time-plan-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};import {TimeProvider} from '@exactjs/time';import type {Component} from '@exactjs/core';export {TimeProvider};import TimeUpdate from '@exactjs/time/enhancements';export {TimeUpdate};
import {createManualTimeClock} from '@exactjs/time/testing';export const clock=createManualTimeClock(2750);export const nestedClock=createManualTimeClock(8750);export {registerDomEnhancementIntegration} from '@exactjs/dom/framework/enhancements';
${modulePrelude ?? ''}
export function Shell(this:Component<{}>,props:{children:import('@exactjs/core').Child}){return()=> <html><head/><body><main id="application">{props.children}</main></body></html>;}
export function App(this:Component<{anchor:number;policy:"millisecond"|"disabled"}>){this.state.anchor=1250;this.state.policy="millisecond";return()=> <main><button onClick={()=>this.state.anchor=4250}>Change anchor</button><button data-policy onClick={()=>this.state.policy=this.state.policy==="disabled"?"millisecond":"disabled"}>Toggle</button><Page anchor={this.state.anchor} update={this.state.policy}/></main>;}
function ClockView(props:{value:number}){return()=> <time>{props.value}</time>;}
export function Page(this:Component<{offset:number}>,props:{anchor:number;update:"millisecond"|"disabled"}){${setup ?? ''}${prelude ?? 'const anchor=props.anchor;'}return()=> <TimeProvider clock={clock}>${childComponent ? '<span time:update>' : ''}<${childComponent ? 'ClockView' : 'time'}${attributes ?? ''} ${enhancementSpread || childComponent ? '' : 'time:update'}${policyExpression ? `={${policyExpression}}` : policy ? `="${policy}"` : ''}>${childComponent ? '' : `{${expression}}`}</${childComponent ? 'ClockView' : 'time'}>${childComponent ? '</span>' : ''}${nested ? `<TimeProvider clock={nestedClock}><time data-nested time:update>{${expression}}</time><time data-frozen time:update="disabled">{${expression}}</time></TimeProvider>` : ''}</TimeProvider>;}`
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
