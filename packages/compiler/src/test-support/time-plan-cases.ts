import '../../../time/src/test-support/temporal-runtime.js';

/** Inputs and expected observations for the shared provider journey. */
export type TimePlanCase = {
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
	omitReceiver?: boolean;
};
/** Standard Temporal supplies an independent value oracle for emitted clock plans. */
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

/** Source cases and independent standard value oracles for manual-clock journeys. */
export const timePlanCases: TimePlanCase[] = [
	{
		name: 'stateless native formatter retains owner typing',
		omitReceiver: true,
		modulePrelude: 'type Parameters<T>=number;',
		expression:
			'new Intl.DateTimeFormat("en-US",{second:"numeric",timeZone:"UTC"}).format(Date.now())',
		expected: (now: number) =>
			new Intl.DateTimeFormat('en-US', { second: 'numeric', timeZone: 'UTC' }).format(now)
	},

	{
		name: 'finite computed clock and rounding members',
		prelude:
			'const clockKey="now" as const;const roundKey="floor" as const;const anchor=props.anchor;',
		expression: 'Math[roundKey]((Date[clockKey]()-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'native Date computed getTime',
		expression: 'Math.floor((new Date()["getTime"]()-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'Temporal finite namespace and member keys',
		prelude:
			'const namespace="Now" as const;const operation="instant" as const;const anchor=props.anchor;',
		expression: 'Math.floor((Temporal[namespace][operation]()["epochMilliseconds"]-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'Temporal zoned clock category',
		expression: 'Math.floor((Temporal.Now.zonedDateTimeISO("UTC").epochMilliseconds-anchor)/1000)',
		expected: (now: number, anchor = 1250) => Math.floor((now - anchor) / 1000)
	},
	{
		name: 'ordinary round method is not a precision request',
		prelude: 'const formatter={round(options:{smallestUnit:string}){return 1}};',
		policy: 'millisecond',
		expression: 'Date.now()+formatter.round({smallestUnit:"nanosecond"})',
		expected: (now: number) => now + 1
	},

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
		name: 'quantized equality fallback',
		expression: 'Math.floor((Date.now()-anchor)/1000)===2?"inside":"outside"',
		expected: (now: number, anchor = 1250) =>
			Math.floor((now - anchor) / 1000) === 2 ? 'inside' : 'outside'
	},
	{
		name: 'quantized inequality fallback',
		expression: 'Math.floor((Date.now()-anchor)/1000)!==2?"outside":"inside"',
		expected: (now: number, anchor = 1250) =>
			Math.floor((now - anchor) / 1000) !== 2 ? 'outside' : 'inside'
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
