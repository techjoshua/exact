# Clock-derived views

`@exactjs/time` makes authored date and time expressions reactive without turning formatting into a
timer API. The source expression defines sign, rounding, clamping, and presentation. The optional
`time:update` enhancement supplies a range-local clock sample and shared scheduling.

## Configure the enhancement

Register the package namespace for each package that authors clock-derived views:

```ts
// exact.config.ts
export * as time from '@exactjs/time/enhancements' with { type: 'exact-enhancement', scope: 'package' };
```

A bare value and `auto` are equivalent:

```tsx
function Countdown(props: { deadline: Date }) {
	return () => (
		<time time:update>{Math.ceil((props.deadline.getTime() - Date.now()) / 1_000)}</time>
	);
}
```

The compiler instruments clock reads only in the enhanced lexical range. Removing the optional
capability leaves the ordinary initial JavaScript result as the fallback. `Date.now()`, zero-argument
`new Date()`, and `Temporal.Now.instant()`, `zonedDateTimeISO()`, `plainDateTimeISO()`,
`plainDateISO()`, and `plainTimeISO()` are recognized clock sources. A clock sample retains the
native number, `Date`, or Temporal category expected by the authored expression.

Put the enhancement on an existing semantic intrinsic when it owns the element's complete content.
Use `_` only for a narrower range, independently governed sibling regions, or content without an
appropriate intrinsic host.

## Accuracy and automatic plans

`auto` derives the next visible boundary from safe arithmetic. Quantized countdown and elapsed-time
expressions using `Math.ceil`, `Math.floor`, `Math.round`, or `Math.trunc` retain their authored
anchor, so a deadline at `12:00:00.250` does not drift onto a wall-clock second boundary. Pure
component-body aliases and lexical micro-components are materialized into the consuming reactive
binding. The same analysis follows statically selected record and array members, including
destructuring, and reusable lexical micro-components may accept different props at each call. Each
call receives its own range sample and registration without becoming a durable child component.
Ordinary durable children remain opaque and declare their own enhancement.

Local formatter functions may contain ordinary pure TypeScript statements and calls. The compiler
follows their local call graph, so formatting does not have to be flattened into JSX:

```tsx
function formatElapsed(totalSeconds: number) {
	const minutes = Math.floor(totalSeconds / 60)
		.toString()
		.padStart(2, '0');
	const seconds = Math.floor(totalSeconds % 60)
		.toString()
		.padStart(2, '0');
	return `${minutes}:${seconds}`;
}

<time time:update="second">{formatElapsed(Math.floor((Date.now() - startedAt) / 1_000))}</time>;
```

Ambient, imported, stateful, or otherwise effectful helpers remain opaque unless their declaration
provides an explicit eXact purity contract.

Finite conditional views adapt their accuracy as the active branch changes. The compiler includes
both the active branch's next visible boundary and the exact threshold that selects the next branch:

```tsx
function Elapsed(props: { startedAt: number }) {
	const seconds = Math.floor((Date.now() - props.startedAt) / 1_000);
	const minutes = Math.floor((Date.now() - props.startedAt) / 60_000);
	const hours = Math.floor((Date.now() - props.startedAt) / 3_600_000);

	return () => (
		<time time:update>
			{seconds < 60 ? `${seconds}s` : minutes < 60 ? `${minutes}m` : `${hours}h`} ago
		</time>
	);
}
```

This range schedules second boundaries initially, switches to minute boundaries at one minute, and
then to hour boundaries at one hour. It does not choose one refresh interval for its lifetime.
Standard `Intl.RelativeTimeFormat` inherits the numeric argument's plan. `Intl.DateTimeFormat` and
native date/time locale formatting derive their smallest visible fixed or calendar field, including
literal formatter time-zone and calendar options.

Fixed-unit Temporal `until()` and `since()` durations rounded to milliseconds through hours are
also planned from their authored anchor. `round()` keeps half-expand behavior on both sides of zero,
including `roundingIncrement`; sub-millisecond requests are rejected because the clock contract is
millisecond based. Calendar-relative Temporal duration rounding is not approximated as fixed
milliseconds: use an explicit calendar policy or keep the calendar result outside automatic mode
until its `relativeTo` context can be represented by a finite plan.

Use an explicit accuracy when the final formatter is intentionally opaque:

```tsx
<output time:update="second">{formatClock(Date.now())}</output>
```

Fixed policies are `millisecond`, `second`, `minute`, and `hour`. Calendar policies are `day`,
`week`, `month`, and `year`; their runtime boundaries use the effective local calendar and time
zone rather than fixed 24-hour or 30-day approximations. Supply those axes independently through
`TimeProvider` when host defaults are not authoritative. Explicit accuracy is a freshness bound,
not an interval promise. Slow work and suspended pages coalesce missed boundaries into one fresh
sample.

The policy may be reactive. `disabled` withdraws scheduling but retains the range's last sample;
ordinary props and state remain reactive. Reenabling queues one current sample after the policy
cycle settles rather than replaying missed ticks. Policy and clock-plan preparation do not subscribe
the enclosing component render; the enhancement policy and clock-derived expression retain their
own precise reactive boundaries, so changing an anchor or policy does not require a keyed remount.

```tsx
<time time:update={this.state.live ? 'auto' : 'disabled'}>
	{Math.floor((Date.now() - props.startedAt.getTime()) / 1_000)}
</time>
```

## Scheduling and ownership

All registrations using the same clock share one earliest-deadline, one-shot scheduler. A fired
timer publishes one immutable sample to the due ranges in one reactive transaction. The scheduler
does not calculate or arm its next timer until that transaction, DOM publication, branch cleanup,
and range disposal settle. It never accumulates historical interval callbacks.

Range ownership follows the durable component and mounted structural generation. Branch and keyed
removal release the corresponding registration; component unmount releases all descendants; an
inactive Activity range suspends scheduling and resumes with a fresh sample. When the last range
leaves, the clock has no retained host timer or wake listener.

Server rendering takes snapshots but never schedules a host timer. Hydration adopts server output
first; mounting then publishes one current client sample and enters ordinary scheduling. The SSR
clock sample is transported only when a rendered artifact actually consumes the time capability,
so applications without `time:update` do not acquire hydration payload or runtime work.

## Authoritative and manual clocks

`TimeProvider` supplies one clock identity to a subtree. Matching identities share a scheduler.
This supports authoritative application time, simulations, and deterministic tests without
patching global `Date`:

```tsx
import { TimeProvider } from '@exactjs/time';
import { createManualTimeClock } from '@exactjs/time/testing';

const clock = createManualTimeClock(Date.UTC(2026, 7, 15));

<TimeProvider clock={clock} timeZone="America/Los_Angeles" calendar="gregory" weekStartsOn={1}>
	<App />
</TimeProvider>;
```

`clock`, `timeZone`, `calendar`, and `weekStartsOn` remain separate props so each concern can be
read, typed, and changed independently. `weekStartsOn` uses `0` for Sunday through `6` for Saturday.

Advancing a manual clock does not recursively replay missed boundaries. Call `runDue()` to publish
the due generation, await reactive settlement, and inspect `nextDeadline` or `pendingTimerCount`.

## Internationalization composition

Time and internationalization remain independent. `time:update` owns sampling and progression;
`intl:message` and native Intl expressions own translation and locale-sensitive formatting. When a
time range is nested in a lexical message, the compiler gives message preparation and the authored
fallback the same range sample:

```tsx
<p intl:message="release-time">
	Release:
	<time time:update="minute">
		{new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' }).format(
			Math.round((props.release.getTime() - Date.now()) / 60_000),
			'minute'
		)}
	</time>
	.
</p>
```

The existing compiler lowering still routes native formatter construction through eXact's bounded
Intl cache. An Intl message may contain several independently governed time ranges; formatter
projections share the matching authored activation rather than allocating clocks of their own.
`@exactjs/time` does not import `@exactjs/intl` and does not create translation units.

## Language assistance and diagnostics

The package contributes completions for every update policy, hover and inlay summaries with inferred
plan evidence, and errors for invalid policies, clock-free ranges, and automatic expressions whose
next visible change cannot be proven. `auto` never silently falls back to millisecond or second
polling. An explicit cadence controls accuracy but does not make an opaque helper with hidden clock
reads safe to repeat. Expose the clock as an argument to a compiler-proven local pure helper:

```tsx
<time time:update="second">{formatCountdown(Date.now(), props.deadline)}</time>
```
