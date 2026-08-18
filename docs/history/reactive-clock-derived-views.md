# Reactive clock-derived views

## Status

**Delivered and archived.** The fixed-scale and calendar runtime, shared settlement-driven
scheduler, compiler-owned `Date`/Temporal clock binding, dependency and formatter inference,
lexical micro-component composition, SSR/hydration clock adoption, deterministic clocks, package
language assistance, bounded inspection, and performance acceptance are implemented. The
[current date/time reference](../date-time.md) is authoritative for shipped behavior.

Calendar-relative Temporal duration rounding that requires an authored `relativeTo` context is
intentionally rejected with a targeted diagnostic instead of being approximated. This preserves
the proposal's finite-plan and calendar-correctness requirements while leaving that additional
context contract for future work.

This proposal adds a separately packaged `time:*` enhancement for views derived from wall-clock
time. It does not add relative-time behavior to `@exactjs/intl`. Internationalization remains an
optional, composable interpretation of the resulting authored view.

The proposal extends the existing lexical micro-component and reactive-expression model. It does
not introduce a second component kind, a runtime template language, a render-prop loop, or one timer
per displayed value.

Normative terms are intentional: **must** identifies a conformance requirement, **should** permits
departure only with a documented reason that preserves the stated invariant, and **may** describes
optional behavior. Examples are illustrative unless a surrounding requirement makes their
behavior normative.

The following terms are used consistently:

- **authored fallback**: the ordinary JavaScript/TSX result produced from the current clock sample,
  which remains useful when scheduling or Intl capability is absent;
- **clock sample**: one immutable instant shared by matching clock reads in a reactive cycle;
- **enhanced range**: the mounted DOM/view range governed by one effective `time:update` policy;
- **registration**: the range-local runtime record connecting a compiled next-change plan to a
  clock scheduler; and
- **settlement**: completion of synchronous reactive propagation, structural selection, DOM
  publication, and owned cleanup for one transaction.

## Decision summary

1. A package-owned `time:update` enhancement opts one authored view range into reactive clock
   reads. `time:update` and `time:update="auto"` are equivalent.
2. Authors express the relationship between fixed and moving time with ordinary JavaScript or
   Temporal operations. There are no `from`, `until`, countdown, stopwatch, or relative-time props.
3. Clock math may appear in JSX, in parent-component derived values, in lexical micro-components,
   or in compiler-provable pure local helpers. Inference follows the value-dependency graph rather
   than source-text containment.
4. Lexical micro-components may accept ordinary props and may be reused any number of times inside
   their owning durable component. They remain owner-local views with no component identity, state,
   lifecycle, task ownership, refs, or registry entry.
5. `auto` derives the earliest next instant at which rendered output may change. If the compiler
   cannot prove a practical bounded plan, compilation requires an explicit update policy.
6. `disabled` is a first-class, reactive policy. It withdraws clock scheduling while retaining the
   last clock sample and continues observing ordinary state and the policy expression.
7. Scheduling uses one shared, one-shot, earliest-deadline scheduler per clock. A timer is never
   rearmed until the current reactive cycle has settled. Missed temporal boundaries are coalesced,
   never queued or replayed.
8. Day, week, month, and year plans use calendar- and time-zone-aware boundaries rather than fixed
   millisecond approximations. Long deadlines use safe checkpoints when the host timer cannot
   represent the complete delay.
9. The time package owns clock sampling and scheduling. `@exactjs/intl` owns translation and
   locale-sensitive formatting only where an author applies `intl:*` or uses a recognized native
   `Intl` expression inside an intl message.

## Motivation

Applications commonly need views such as:

- a countdown that continues through zero into negative time;
- a stopwatch or elapsed-duration display;
- “three minutes ago” or “next month” prose;
- current date, month, or year labels;
- deadlines that update only while visible or enabled; and
- several independently anchored displays sharing one clock.

The fixed point alone does not state any of these meanings. The authored expression does:

```tsx
Math.ceil((props.deadline.getTime() - Date.now()) / 1_000);
// deadline - now: positive before the deadline and negative after it
```

```tsx
Math.floor((Date.now() - props.startedAt.getTime()) / 1_000);
// now - start: elapsed whole seconds
```

```tsx
Temporal.Now.instant().until(props.deadline);
// signed Temporal duration from now to the deadline
```

These expressions already provide a meaningful source fallback. The missing framework behavior is
to make the explicit clock read reactive, derive when its observable output can next change, and
share the corresponding scheduling resource.

## Goals

- Preserve ordinary JavaScript, TypeScript, Temporal, and native `Intl` expressions as the source
  of timing and presentation semantics.
- Make authored source produce a correct initial snapshot without generated callbacks or a new
  formatting DSL.
- Support parent-local reusable lexical micro-components with ordinary props.
- Update only bindings downstream of the opted-in clock read.
- Infer an exact or conservative next-change deadline in `auto` mode.
- Permit a reactive `disabled` policy that stops and restarts scheduling deterministically.
- Share one timer across any number of due registrations for the same clock.
- Coalesce missed boundaries and prevent timer backlog under slow work or browser suspension.
- Support fixed-duration, anchor-aligned, calendar-aligned, and locale/time-zone-sensitive plans.
- Compose with existing Intl message analysis without making either package depend on the other's
  runtime.
- Preserve SSR, hydration, lazy activation, branch withdrawal, keyed ownership, and cleanup.
- Provide deterministic clocks and scheduler control for tests.

## Non-goals

- Hard real-time delivery guarantees.
- Replaying every missed millisecond, second, day, or other historical tick.
- Making every `Date.now()` or `Temporal.Now.*` call reactive without an explicit enhancement.
- Adding `RelativeTime`, `Countdown`, or `Stopwatch` as required component APIs.
- Adding a time-specific message or template language.
- Treating a lexical micro-component as a durable component instance.
- Inspecting through an ordinary durable child component to find clock reads.
- Making `disabled` pause conceptual time. It suspends view updates; application state still owns
  stopwatch pause accounting, simulated time, or business-time semantics.
- Guessing a coarse cadence when `auto` cannot prove that the output remains unchanged.
- Representing months or years as fixed numbers of milliseconds.

## Rejected alternatives and rationale

### Put automatic progression in Intl

Rejected because translation and formatting determine how a value is expressed, while clock
sampling determines when an otherwise ordinary expression is reevaluated. A countdown can be
numeric, graphical, untranslated, or custom-formatted. Keeping `time:*` separate lets either
capability work alone and prevents the Intl runtime from owning timers.

### Require countdown, stopwatch, or relative-time components

Rejected as the primitive because those components would hide authored sign, rounding, clamping,
and post-zero behavior behind a fixed abstraction. Applications may build such components on top
of `time:update`, but the framework primitive keeps the ordinary fallback expression authoritative.

### Pass a function or options object to the enhancement

Rejected because a callback duplicates the lexical micro-component/view language and obscures the
reactive dependencies the compiler already understands. An object-valued prop also combines
independent policy axes and makes ordinary reactive updates less legible. The view remains JSX;
policy fields remain independent enhancement fields or context.

### Infer only from JSX text

Rejected because eXact already treats component-body derived values and lexical micro-components
as part of the owner's reactive program. Restricting analysis to textual descendants would make a
harmless refactor change timing behavior and would prevent reusable owner-local views.

### Poll at a default fixed interval

Rejected because a one-second default is both wasteful for month/year output and incorrect for
millisecond or non-wall-aligned values. `auto` must prove a next visible change; explicit cadence is
the escape hatch when it cannot.

### Give each view an interval timer

Rejected because independently mounted displays would allocate redundant resources, drift apart,
and create queued interval debt during slow work or suspension. The selected scheduler shares one
clock sample and one earliest-deadline one-shot timer.

### Rearm before the reactive cycle finishes

Rejected because the cycle may change the deadline, policy, calendar, branch, or ownership. Rearming
early creates stale schedules and can queue work faster than the application settles. Final state
after settlement is the only input to the next arm.

### Pause conceptual time while disabled

Rejected because presentation suspension and business-time pause semantics are different. The
enhancement freezes its published clock sample; application state expresses excluded pause periods
or simulated time explicitly.

## Source API

The time package exports an enhancement namespace intended to be registered as `time`:

```ts
export type TimeUpdatePolicy =
	| true
	| 'auto'
	| 'millisecond'
	| 'second'
	| 'minute'
	| 'hour'
	| 'day'
	| 'week'
	| 'month'
	| 'year'
	| 'disabled';
```

`true` is the canonical JSX value produced by a bare attribute and is equivalent to `auto`:

```tsx
<time time:update>{clockDerivedValue}</time>
<time time:update="auto">{clockDerivedValue}</time>
```

Omitting `time:update` leaves clock calls as ordinary snapshots and creates no scheduling
capability:

```tsx
<time>{Date.now()}</time>
```

The enhancement may govern any intrinsic whose complete rendered content has the same update
policy. Authors should attach it to that semantic intrinsic. The transparent `_` range is reserved
for a genuinely narrower clock-derived region, multiple independently governed regions within one
host, or a location with no appropriate intrinsic:

```tsx
<p>
	Offer expires <_ time:update>{formatExpiry(props.deadline, Date.now())}</_>.
</p>
```

The package publishes `update` from `@exactjs/time/enhancements` as a generic enhancement field,
and its component-library capability metadata binds that field to the `time` namespace. The core
compiler consumes only the generic activation and generated finite plan; it must not contain a
hard-coded `time:update` allowlist.

The update policy is an ordinary reactive prop:

```tsx
<time time:update={this.state.live ? 'auto' : 'disabled'}>
	{Math.ceil((props.deadline.getTime() - Date.now()) / 1_000)}
</time>
```

The first implementation must not add object-valued activation shorthand. Independent future
concerns such as choosing a non-default clock or time zone must use separate fields or context, not
an options object hidden inside `time:update`.

## Lexical micro-components and reuse

The current lexical micro-component contract remains authoritative. A micro-component is an
immutable, PascalCase, synchronous arrow in a durable component body. It contains one view
expression, captures the parent's lexical `this`, and accepts ordinary props.

```tsx
function EventDashboard(props: { registrationDeadline: Date; eventDeadline: Date }) {
	const Countdown = (props: { label: string; deadline: Date }) => (
		<p>
			{props.label}{' '}
			<time time:update>{Math.ceil((props.deadline.getTime() - Date.now()) / 1_000)}</time>
		</p>
	);

	return () => (
		<section>
			<Countdown label="Registration closes in" deadline={props.registrationDeadline} />
			<Countdown label="Event begins in" deadline={props.eventDeadline} />
		</section>
	);
}
```

Each invocation owns a distinct mounted view range and distinct clock registration parameters.
The registrations share the clock scheduler. Invoking the same micro-component does not construct
durable child component instances.

The compiler attributes every micro-component expression, registration, source range, diagnostic,
and cleanup edge to the enclosing durable component instance. A micro-component cannot:

- escape through props, state, context, return values, or module exports;
- register lifecycle, tasks, resources, refs, or component context;
- receive a component brand or DevTools component identity; or
- become a catalog, registry, server-operation, or hydration owner.

An ordinary durable component remains opaque. A child that needs live clock behavior declares its
own `time:update` range.

## Clock-derived values outside JSX

Clock math does not need to be textually inside the enhanced JSX element:

```tsx
function Countdown(props: { deadline: Date }) {
	const millisecondsRemaining = props.deadline.getTime() - Date.now();
	const secondsRemaining = Math.ceil(millisecondsRemaining / 1_000);
	const text = formatSignedClock(secondsRemaining);

	return () => <time time:update>{text}</time>;
}
```

`time:update` is a sink in the dependency graph. Analysis walks backward through the value used by
the enhanced range until it reaches clock sources, reactive inputs, constants, and unsupported
operations. Source location is irrelevant.

The supported graph includes:

- component-body derived constants;
- immutable aliases and statically provable destructuring;
- lexical micro-component props and captures;
- arrays or records whose relevant member remains statically known;
- finite conditions and active branches;
- recognized pure numeric, date, and Temporal operations; and
- compiler-provable pure local helper summaries.

The compiler must not rerun the component setup body. It lowers the proven dependency slice into
the parent's existing reactive graph. Calls or expressions with unproven side effects are not
silently lifted into repeated work.

### Local and imported helpers

A pure local helper may be summarized interprocedurally:

```tsx
const secondsUntil = (deadline: Date) => Math.ceil((deadline.getTime() - Date.now()) / 1_000);
```

An opaque formatter can inherit the plan of an already quantized argument because a pure function's
output cannot change while its inputs do not:

```tsx
formatSignedClock(Math.ceil((deadline.getTime() - Date.now()) / 1_000));
```

An opaque helper that hides the clock read cannot use `auto` without a trusted compiler summary:

```tsx
importedCountdown(deadline);
```

Published packages may eventually expose inert, versioned time-sensitivity summaries. This
proposal does not authorize evaluating package code during analysis or treating a TypeScript type
annotation alone as purity proof.

An explicit policy permits a repeatable but schedule-opaque transformation when the clock source
remains reachable and ordinary compiler analysis proves reevaluation safe:

```tsx
<time time:update="second">{safeOpaqueFormatting(Date.now())}</time>
```

An explicit cadence supplies timing, not trust. In the first implementation it cannot make
`importedCountdown(deadline)` repeatable when both the clock read and helper behavior are opaque.
If purity or a reachable/trusted clock dependency cannot be proven, the compiler reports a
diagnostic rather than repeating an arbitrary setup call.

## Recognized clock sources

Within a dependency slice activated by `time:update`, the first implementation recognizes:

```ts
Date.now();
new Date(); // zero-argument construction only
Temporal.Now.instant();
Temporal.Now.zonedDateTimeISO();
Temporal.Now.plainDateTimeISO();
Temporal.Now.plainDateISO();
Temporal.Now.plainTimeISO();
```

Calls outside an activated slice retain normal snapshot behavior. A time analyzer may reject a
custom or dynamically selected clock source unless it has a trusted time-clock contract.

All due reads from the same clock in one scheduler-driven reactive cycle observe one shared sample.
This is an explicit semantic consequence of `time:update`: it prevents sibling countdowns from
drifting because their source expressions happened to execute at slightly different instants.

Date and Temporal projections must preserve their native value categories. Instrumentation must
not replace a `Date` with a number or a `Temporal.Instant` with a string merely to share a sample.

## Temporal sensitivity and `auto`

`auto` is the default because the framework normally has more information than an authored polling
interval. Analysis produces a next-change plan for each clock-dependent output binding.

A plan answers:

```ts
interface TimeChangePlan {
	/** Returns the first instant after the rendered sample at which output may differ. */
	nextChangeAfter(
		renderedAt: Temporal.Instant,
		inputs: readonly unknown[]
	): Temporal.Instant | undefined;
}
```

This interface is descriptive; the emitted protocol may use finite opcodes and binding indexes. It
must not serialize closures or source text.

`undefined` means the currently active branch has no further clock-driven change. A later ordinary
reactive input change may produce a new plan.

### Propagation rules

The analyzer propagates temporal sensitivity through a bounded expression graph:

| Operation class                            | Required inference                                                 |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Clock read                                 | Continuous wall-clock dependency from a named clock                |
| Addition/subtraction                       | Preserve an affine clock relation and any reactive offset          |
| Multiply/divide by finite constant         | Scale the relation without losing boundary alignment               |
| `floor`, `ceil`, `round`, `trunc`          | Produce exact quantization boundaries                              |
| `abs`, unary negation                      | Preserve boundaries and sign transitions                           |
| `min`/`max` with finite operands           | Preserve active boundaries and clamp thresholds                    |
| Remainder with finite divisor              | Preserve wrap and next quantized boundary                          |
| Comparison                                 | Schedule the exact threshold crossing when provable                |
| Conditional                                | Use the active branch and include the next condition transition    |
| String/template composition                | Use the earliest dependency boundary                               |
| Pure function of discrete inputs           | Inherit the earliest input boundary                                |
| Record/array projection                    | Preserve the selected member's plan                                |
| `until`, `since`, duration `total`/`round` | Preserve Temporal anchor, unit, rounding, calendar, and zone facts |

For multiple dependencies, the earliest possible change wins. Analysis may schedule harmless extra
updates, but it must never choose a later deadline than a provable visible change.

### Representative inference

```ts
Math.ceil((deadline.getTime() - Date.now()) / 1_000);
```

This produces an integer-second plan aligned to `deadline`, not to mount time or the wall-clock
second boundary.

```ts
Math.floor((Date.now() - startedAt.getTime()) / 60_000);
```

This produces a whole-minute plan aligned to `startedAt`.

```ts
deadline.getTime() > Date.now() ? countdown : 'Complete';
```

The branch threshold is a deadline. After the `Complete` branch becomes active, the plan may return
`undefined` if that branch contains no other clock read.

### Standard formatter inference

The time analyzer recognizes the visible sensitivity of standard formatter operations without
giving the time runtime ownership of localization:

- `Intl.DateTimeFormat` uses the smallest displayed field, effective calendar, and effective time
  zone. A year-only format changes at the next year boundary; a month/year format at the next month
  boundary; a weekday/date format at the next local day boundary.
- `Intl.RelativeTimeFormat` inherits the plan of its numeric argument and literal unit. The authored
  math or Temporal operation continues to define sign and rounding.
- `Intl.DurationFormat` uses its smallest displayed unit and fractional precision.
- Native `toLocaleString()` projections use the same corresponding standard facts.

This build-time recognition does not cause the time package to translate text or own formatter
instances. The existing compiler/Intl caching layer remains responsible for native formatter
reuse.

### Failure to infer

The following `auto` use is not safely bounded:

```tsx
<output time:update>{arbitraryFormatter(Date.now())}</output>
```

Unless `arbitraryFormatter` has a trusted pure summary that quantizes its argument, the compiler
reports that automatic update accuracy cannot be inferred. It suggests an explicit policy.

The implementation must not silently choose one second, one animation frame, or one millisecond.
Those choices can be wasteful or observably incorrect.

## Explicit update policies

An explicit policy is an author-selected maximum update granularity when exact visible-change
inference is unavailable or intentionally unnecessary:

```tsx
<output time:update="second">{safeOpaqueFormatting(Date.now())}</output>
```

When a more exact provable boundary exists, the runtime uses the earlier of that boundary and the
explicit maximum interval. Explicit policies never authorize reevaluating impure work.

Fixed policies have these maximum nominal spans:

| Policy        |  Nominal span |
| ------------- | ------------: |
| `millisecond` | 1 millisecond |
| `second`      |      1 second |
| `minute`      |      1 minute |
| `hour`        |        1 hour |

These are update accuracy requests, not hard-real-time delivery promises. Scheduling begins from
the final settlement time and does not accumulate interval debt.

Calendar policies mean the next boundary in the effective calendar and time zone:

| Policy  | Boundary                                            |
| ------- | --------------------------------------------------- |
| `day`   | Start of the next local calendar day                |
| `week`  | Start of the next locale/configuration-defined week |
| `month` | Start of the next calendar month                    |
| `year`  | Start of the next calendar year                     |

They are not equivalent to 24 hours, 7 fixed days, 30 days, or 365 days. If an expression supplies
an explicit Temporal calendar/time zone or a recognized formatter supplies them, those values win.
Otherwise the nearest time environment supplies defaults. A missing or ambiguous calendar/zone for
a calendar policy is a diagnostic rather than an implicit UTC/local mixture.

## Reactive `disabled`

`disabled` keeps the enhancement and its compiled plan present but inactive:

```tsx
<time time:update={this.state.live ? 'auto' : 'disabled'}>{derivedClockText}</time>
```

While disabled:

- the range has no active clock-scheduler registration;
- it retains its last published clock sample;
- clock progression does not publish new output into the range;
- ordinary reactive state, props, locale, and structural dependencies remain active; and
- reevaluation caused by an ordinary dependency observes the retained clock sample rather than
  silently advancing time.

Changing to `disabled` does not synthesize an extra clock tick. At reactive settlement the final
policy withdraws the registration and fences any previously dequeued callback. This gives
“disabled” the precise meaning “stop clock-driven updates now.”

Changing from `disabled` to an active policy queues one immediate, coalesced clock cycle after the
policy-changing cycle settles. That cycle samples current time, updates affected bindings, and only
then calculates a future deadline. Missed ticks are not replayed.

Changing among active policies, deadlines, calendars, time zones, or formatter options marks the
registration dirty. Reconciliation uses only the final values after the current reactive cycle
settles.

`disabled` pauses presentation, not time itself. A stopwatch that must exclude paused time keeps a
paused instant or accumulated pause duration in application state and expresses that arithmetic in
its derived value.

A statically disabled range contributes no active client timer. If whole-program reachability proves
that no active policy is possible, bundling may omit the scheduler capability for that artifact.

## Shared scheduler

The runtime owns one scheduler per clock identity. All default wall-clock registrations in one
realm share one scheduler, including registrations created by separate provider roots, lazy
artifacts, and microfrontends using the same compatible runtime realm.

The scheduler owns:

- one min-ordered collection of registrations by absolute next deadline;
- at most one host one-shot timer;
- at most one coalesced immediate-follow-up request;
- a generation for every registration; and
- the current arm/checkpoint generation.

It never uses `setInterval()`.

### Settlement-driven invariant

The normative invariant is:

> A clock scheduler must not calculate or arm its next timer until the reactive cycle caused by the
> current tick, policy change, or ordinary input change has fully settled.

“Settled” here means synchronous reactive propagation, structural selection, DOM publication, and
owned cleanup for that transaction have completed. It does not wait for unrelated asynchronous
tasks or network work.

The tick sequence is:

1. A one-shot timer or external clock notification fires.
2. The scheduler disarms that notification before publishing work.
3. It samples the clock once.
4. It selects every registration whose absolute deadline is due at that sample.
5. It publishes that shared sample to the due clock bindings in one reactive transaction.
6. eXact completes the transaction and releases any ranges withdrawn during it.
7. A settlement hook reconciles dirty, added, removed, disabled, reenabled, and completed
   registrations using final inputs.
8. If a visible boundary passed during the transaction, reconciliation queues one immediate
   follow-up turn. It does not queue one turn per missed boundary.
9. Otherwise reconciliation arms one timer for the earliest future deadline or safe checkpoint.

No timer is armed while a clock-driven reactive transaction is active. Reentrant invalidations only
mark registrations dirty for the settlement reconciliation.

### Slow work and missed boundaries

If a millisecond-accurate view takes five milliseconds to settle, five historical ticks do not
exist as pending work. At most one immediate follow-up uses a fresh sample. If every cycle remains
slower than the requested accuracy, the scheduler yields between coalesced cycles and updates as
quickly as the host can settle them without an unbounded queue.

This is a best-effort freshness contract, not a claim that the browser commits at a hard real-time
frequency. Documentation and DevTools must use “accuracy” or “next visible change,” not promise
that work “runs every millisecond.”

### Long deadlines and checkpoints

Host timers may not represent a delay as long as the calculated deadline. The scheduler therefore
caps an armed delay to a platform-safe maximum. Reaching a checkpoint:

- does not publish a clock update unless a visible deadline is actually due;
- samples the current clock;
- detects wall-clock drift or suspension; and
- arms the next checkpoint or actual deadline after settlement-safe reconciliation.

The scheduler also reconciles after `pageshow`, return to visible document state, runtime resume,
or another host-provided wake signal. Sleeping across a day, month, or year boundary causes one
fresh update on resume, not a replay of every missed boundary.

### Generation fencing

Every registration change advances its generation. A timer callback or due record captured under
an older generation cannot publish after the range is disabled, replaced, unmounted, rekeyed, or
rescheduled. Timer cancellation is an optimization; generation validation is the correctness
boundary.

## Calendar and time-zone correctness

Calendar plans use absolute instants for scheduling and calendar/zoned values for calculating the
next boundary.

The implementation must account for:

- 23-, 24-, and 25-hour local days;
- month length and leap years;
- non-Gregorian calendars supported by the selected Temporal/Intl provider;
- locale or configuration week starts for `week`;
- formatter `timeZone` and `calendar` options;
- Temporal values carrying an explicit zone or calendar; and
- reactive changes to any effective zone or calendar.

The effective source order is:

1. An explicit Temporal value or formatter option used by the expression.
2. A separate time-enhancement field selected by a later proposal, if implemented.
3. The nearest time environment.
4. No implicit fallback for a calendar plan when the environment cannot provide an unambiguous
   value.

Fixed instant arithmetic remains instant arithmetic. The analyzer must not replace an authored
`duration.total({ unit: 'days' })` calculation with local-midnight scheduling merely because the
word “day” appears in the source.

## Ownership and cleanup

The durable component containing the enhanced range owns the registration. More precisely, the
registration follows the mounted range/generation that contains the clock-dependent binding:

- branch withdrawal removes the registration;
- keyed removal removes only the removed item's registration;
- same-key updates retain the range and reschedule final changed inputs;
- component unmount removes all owned registrations;
- Activity parking or other retained-view behavior follows that feature's explicit active/background
  policy rather than inventing time-specific ownership;
- lazy activation registers only when the relevant client artifact mounts; and
- a failed mount must release a provisionally created registration.

Lexical micro-components never own registrations independently. DevTools may attribute an enhanced
micro-view source range beneath its durable owner, but it must not report a fabricated component
instance.

When the last active registration leaves a scheduler, the scheduler cancels its host timer and
retains no callback closure referring to the released owner.

## SSR and hydration

SSR never starts a timer. One request-owned clock snapshot is used for all matching clock reads in
the render transaction so sibling output is internally consistent.

The server-rendered value remains the authored fallback and may be older when hydration begins.
Hydration must first adopt and validate the server DOM without treating elapsed wall time as a
corruption. After the hydration transaction settles, every active hydrated time registration
receives one coalesced current-time update and then enters normal scheduling.

This ordering prevents both source/client mismatch and a timer firing into a partially hydrated
range. A statically or reactively disabled range retains the adopted server sample until enabled or
an ordinary non-clock dependency legitimately changes it.

Server and client clocks may differ. Applications requiring authoritative or simulated time must
provide a compatible clock environment; the default contract does not conceal skew by rewriting
business data.

## Intl composition

The time package has no runtime dependency on `@exactjs/intl` and never creates a translation unit.

A nonlinguistic countdown needs no Intl enhancement:

```tsx
const Countdown = (props: { deadline: Date }) => (
	<time time:update>{Math.ceil((props.deadline.getTime() - Date.now()) / 1_000)}</time>
);
```

Native localized formatting continues to use the compiler's existing cache and requires Intl
message semantics only when it participates in translatable language:

```tsx
const RelativeDeadline = (props: { deadline: Date }) => (
	<time time:update intl:message>
		{new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' }).format(
			Math.round((props.deadline.getTime() - Date.now()) / 60_000),
			'minute'
		)}
	</time>
);
```

A lexical micro-component is an owner-local view, not an opaque durable component boundary. Intl
analysis must therefore follow compiler-resolved lexical micro-component calls when they occur
inside a lexical message:

```tsx
function Event(props: { deadline: Date }) {
	const Countdown = () => (
		<time time:update>{Math.ceil((props.deadline.getTime() - Date.now()) / 1_000)}</time>
	);

	return () => (
		<p intl:message>
			The event begins in <Countdown />.
		</p>
	);
}
```

The resulting `<time>` range may become translator-movable structure or contain a formatter
placeholder according to the existing Intl message rules. Intl still does not descend through an
ordinary durable component implementation.

Time sensitivity analysis and Intl analysis may share build-only normalized facts for standard
native operations, but neither runtime package may import the other or duplicate formatter
ownership.

## Mixed active and disabled consumers

A clock-derived value can feed several mounted ranges with different update policies. Scheduling
and publication are range-local even when compiler planning reuses a pure calculation:

```tsx
const seconds = Math.ceil((props.deadline.getTime() - Date.now()) / 1_000);

return () => (
	<>
		<time time:update>{seconds}</time>
		<time time:update="disabled">{seconds}</time>
	</>
);
```

The active range publishes current values. The disabled range retains the value from its last clock
sample. Compiler common-subexpression reuse must not bypass the range's publication gate and update
a disabled DOM binding. The underlying plan may be shared; the rendered sample is range-owned.

If a single enhanced ancestor owns both consumers, its nearest explicit nested `time:update` policy
wins for clock-derived bindings in that nested range. An explicitly active nested range may remain
active beneath a disabled ancestor; an omitted nested policy inherits the nearest active scope.
This lexical rule prevents runtime ancestor searches or ambiguous timer ownership.

## Clock environments and testing

The time package must define a finite clock contract that separates sampling from host scheduling.
The default environment uses wall-clock instants and the shared browser scheduler. Tests use a
manual clock that advances only when instructed and exposes pending deadlines without real sleeps.

At minimum, the testing surface must support:

```ts
interface ManualTimeClock {
	now(): Temporal.Instant;
	advance(duration: Temporal.Duration): void;
	runDue(): void;
	readonly nextDeadline: Temporal.Instant | undefined;
}
```

The exact provider API is selected during implementation, but it must satisfy these contracts:

- clock identity determines scheduler sharing;
- a clock sample is immutable within one reactive cycle;
- manual advancement does not automatically recurse through every missed boundary;
- `runDue()` uses the same settlement and coalescing algorithm as production;
- tests can assert that no host timer remains after disposal or disabling; and
- calendar tests can provide explicit calendars, zones, and transition instants.

Do not make tests depend on real timeouts or monkey-patch global `Date` across unrelated tests.

## Diagnostics and language tooling

The provider must report source-linked diagnostics for:

- `auto` whose clock dependency or practical next-change plan cannot be proven;
- explicit cadence over an expression unsafe to reevaluate;
- `time:update` with no reachable clock dependency;
- an unsupported or dynamic clock source;
- an invalid update-policy value;
- calendar policies without a determinate calendar or time zone;
- a lexical micro-component that escapes its owner;
- time analysis crossing an ordinary durable component boundary;
- conflicting nested time policies on the same binding range;
- a helper whose body or published summary cannot prove purity; and
- a requested precision unavailable from the selected clock.

Hover and inspection should show:

- clock identity and source;
- inferred or explicit update policy;
- the derived next-change class and alignment input;
- effective calendar and time zone when applicable;
- active/disabled status when statically known;
- the owning durable component and lexical micro-view source range; and
- why inference stopped when an explicit policy is required.

Diagnostics should propose the narrowest useful correction, such as adding
`time:update="second"`, exposing `Date.now()` as an explicit pure helper argument, or moving the
enhancement inside the durable child that owns the view.

## DevTools and inspection

Inspection may report one clock scheduler and bounded registration summaries:

- active registration count;
- disabled retained-range count;
- next armed deadline or checkpoint;
- coalesced/missed-boundary count;
- last cycle duration;
- effective policy distribution; and
- owner component/source selectors.

It must not expose component instances through micro-components, retain application values merely
for inspection, or publish compiler operation identities as application API.

## Runtime and build module ownership

The initial package boundary mirrors other optional compiler-led capabilities:

- `@exactjs/time` owns public types, enhancement declaration, runtime clocks/scheduler, capability
  metadata, and the language-provider entry point;
- `@exactjs/time-analyzer` owns build-only dependency and temporal-sensitivity analysis; and
- `@exactjs/time-build` owns shared bundler coordination and generated companion artifacts.

`@exactjs/time` may declare the analyzer as an optional peer in the same manner as other language
capabilities. Applications without reachable `time:update` usage must not receive analyzer/runtime
companions in client artifacts.

Implementation should keep the following domains separate:

| Domain                                                  | Owner                             |
| ------------------------------------------------------- | --------------------------------- |
| Public update-policy and clock contracts                | Time package contract module      |
| Clock-source and sensitivity analysis                   | Build-only time analyzer          |
| Finite emitted next-change protocol and validation      | Time plan module                  |
| Default/manual clock implementations                    | Clock modules                     |
| Earliest-deadline queue, checkpointing, and generations | Scheduler module                  |
| Enhancement activation and mounted-range registration   | Time enhancement component module |
| Language hovers, diagnostics, and source evidence       | Time language provider            |
| Bundler requirement discovery and companion generation  | Shared time build coordinator     |

Public `index.ts` files remain facades. Do not put scheduling, plan validation, clock conversion, and
enhancement rendering into one implementation module. Exported contracts and non-obvious lifecycle
operations require contract-focused JSDoc under the repository maintainability standard.

The runtime plan is data-only and bounded. Validation must enforce protocol version, supported
opcodes, binding kinds, maximum depth/node counts, finite numeric constants, valid calendars/zones,
and absence of executable callbacks or source text.

## Implementation sequence

Before adding time-specific emission, complete phases 1 through 3 of the
[native component-lowering decomposition](../history/native-component-lowering-decomposition.md). That
refactor gives generated time plans a defined enhancement/reactivity boundary without adding more
responsibility to the traversal coordinator. Task-lowering extraction is independent and does not
block this feature.

### Phase 1: finite fixed-scale core

1. Add `time:update` with `auto`, explicit millisecond through hour policies, and `disabled`.
2. Recognize `Date.now()`, `new Date()`, and `Temporal.Now.instant()`.
3. Trace aliases, component derived values, lexical micro-component props, arithmetic, quantization,
   finite conditions, and pure local helpers.
4. Emit and validate finite affine/quantized plans.
5. Implement one settlement-driven shared scheduler with generation fencing.
6. Add manual-clock tests and SSR/hydration activation.

### Phase 2: standard formatting and calendar plans

1. Add DateTimeFormat, RelativeTimeFormat, DurationFormat, locale-string, and Temporal rounding
   sensitivity.
2. Add day, week, month, and year calendar plans with explicit zone/calendar resolution.
3. Add safe long-deadline checkpoints and host resume reconciliation.
4. Share normalized build facts with Intl analysis without adding a runtime dependency.

### Phase 3: tooling and published contracts

1. Add editor hovers, inference evidence, completions, and targeted diagnostics.
2. Add DevTools scheduler summaries and coalescing observations.
3. Evaluate versioned inert summaries for safe cross-package time helpers only if a concrete package
   needs them.
4. Measure large registration sets, disabled views, calendar deadlines, and slow reactive work.

Each phase must leave unsupported forms diagnostic rather than silently approximate them.

## Verification strategy

### Compiler and analyzer tests

- Clock math directly in JSX and through multiple component-body aliases.
- Pure local helper summaries and rejected effectful/opaque helpers.
- Reusable lexical micro-components with different prop anchors.
- Clock dependencies through records, destructuring, conditions, and formatting.
- Exact floor/ceil/round/trunc boundary calculations with non-wall-aligned anchors.
- Active-branch threshold plans and plans that become complete.
- Auto failure diagnostics and explicit-policy recovery.
- No scheduling capability for clock snapshots outside `time:update`.
- No traversal through durable component boundaries.
- Intl analysis through lexical micro-components without runtime package coupling.

### Scheduler tests

- One host timer for many same- and mixed-deadline registrations.
- No timer rearm before reactive settlement.
- State/deadline/policy churn within one transaction produces one final reconciliation.
- Slow cycles coalesce missed boundaries with at most one immediate follow-up.
- No interval backlog under millisecond accuracy.
- Disable, reenable, active-policy change, removal, replacement, and stale callback fencing.
- No timer after the final active registration leaves.
- Long deadlines use checkpoints without publishing early.
- Resume after suspension publishes once with current time.

### Calendar tests

- Local midnight across spring-forward and fall-back transitions.
- Month ends of 28, 29, 30, and 31 days.
- Leap-year transition.
- Year transition while a page remains mounted.
- Explicit formatter time zones differing from the host zone.
- At least one supported non-Gregorian calendar.
- Reactive time-zone/calendar changes reschedule after settlement.

### DOM, ownership, and hydration tests

- Only clock-dependent bindings patch; siblings retain DOM identity.
- Reused lexical micro-component calls keep distinct displayed samples and registrations.
- Keyed removal releases only its registration.
- Disabled output freezes while ordinary state in the same range remains reactive.
- Hydration adopts server text and performs one post-settlement current-time refresh.
- Lazy activation and failed mount release provisional resources.
- No fabricated component lifecycle or DevTools identity for lexical micro-components.

### Differential and property tests

- For every finite quantized plan, compare generated next deadlines with brute-force evaluation
  around boundaries, including negative values and zero crossings.
- For calendar plans, compare generated boundaries with Temporal operations across supported zones
  and transitions.
- Randomize reactive-cycle duration and prove pending clock work remains bounded by one immediate
  follow-up plus one host timer.
- Compare direct authored fallback output with compiled output at the same clock sample.

### Performance gates

Measure:

- 1, 100, 1,000, and 10,000 active registrations sharing one clock;
- mixed second/minute/day/month/year deadlines;
- mostly disabled populations;
- deadline and policy churn in one transaction;
- timer callback allocation and retained heap after removal;
- mutation-to-paint time for due subsets;
- bundle cost for applications with no time enhancement and with fixed/calendar plans; and
- SSR throughput and hydration activation cost.

The implementation must demonstrate no meaningful runtime or bundle cost for applications without
reachable `time:update` usage and no per-tick allocation proportional to all registered views when
only a small due subset changes.

## Acceptance criteria

Implementation is complete only when all of the following hold:

1. `time:update` defaults to `auto`, accepts the specified explicit policies and reactive
   `disabled`, and uses no object-valued activation shorthand.
2. Ordinary authored clock math provides the source fallback and defines countdown/elapsed sign,
   rounding, clamping, and presentation.
3. Dependency analysis reaches clock math outside JSX without rerunning component setup or impure
   work.
4. Reusable prop-bearing lexical micro-components remain part of their durable parent and never
   acquire component identity or lifecycle.
5. Auto plans never schedule later than a provable visible change and reject unbounded inference.
6. The scheduler uses one-shot earliest-deadline scheduling, rearms only after reactive settlement,
   and never accumulates historical ticks.
7. Slow work, background suspension, and long deadlines remain bounded and coalesced.
8. Day/week/month/year behavior is calendar- and time-zone-correct rather than millisecond-based.
9. Disabled ranges retain a frozen clock sample, ordinary reactivity, immediate coalesced restart,
   and stale-generation fencing.
10. SSR uses one request snapshot; hydration adopts it before one post-settlement live refresh.
11. Intl behavior occurs only through existing Intl/native-formatting composition and can analyze
    owner-local lexical micro-components without crossing durable component boundaries.
12. Runtime plans are finite validated data, clocks are injectable for tests, and no application
    closure or source text enters generated scheduling metadata.
13. Focused, differential, calendar, ownership, hydration, performance, and cleanup tests pass.
14. Current references, package README/agent guidance, public docs-app pages, examples, and proposal
    status are updated when implementation lands; until then they must not advertise this behavior
    as current.

## Documentation transition

While this proposal remains unimplemented, only the proposal index should link to it. On delivery:

1. Add a current date/time reference under `docs`.
2. Add the corresponding public docs-app route, navigation, search terms, examples, limitations,
   and language-tool diagnostics.
3. Update the component-language reference for clock-derived lexical micro-components.
4. Update internationalization documentation only to explain optional composition, not to transfer
   clock ownership to Intl.
5. Add concise package README and application-authoring `AGENTS.md` guidance.
6. Move this document to `docs/history` after the current references become authoritative.
