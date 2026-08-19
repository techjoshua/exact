# @exactjs/time

Clock-derived reactive views for eXact. The compiler preserves ordinary date/time math as the
fallback while the optional `time:update` enhancement shares scheduling across mounted ranges.

## Usage

```ts
// exact.config.ts
export * as time from '@exactjs/time/enhancements' with { type: 'exact-enhancement', scope: 'package' };
```

```tsx
function Countdown(props: { deadline: Date }) {
	return () => (
		<time time:update>{Math.ceil((props.deadline.getTime() - Date.now()) / 1_000)}</time>
	);
}
```

`auto` is the bare-attribute default. Explicit `millisecond`, `second`, `minute`, `hour`, `day`,
`week`, `month`, and `year` policies bound update accuracy; `disabled` freezes the range's clock
sample while ordinary reactive dependencies continue to work. Automatic plans adapt across finite
conditional seconds/minutes/hours/calendar branches and reject expressions whose next visible
change cannot be proven instead of silently polling. Analysis follows safe aliases, static
record/array projections, destructuring, and prop-bearing lexical micro-views. Fixed-unit Temporal
rounding preserves authored anchors and half-expand boundaries; calendar-relative Temporal
duration rounding requires an explicit calendar policy rather than a fixed-millisecond guess.
Local pure TypeScript formatters are followed through their call graph, including ordinary numeric
and string formatting; opaque, imported, or effectful helpers remain diagnostic.
`TimeProvider` accepts separate clock, time-zone, calendar, and week-start fields. The package also
contributes policy completions, activation inspection, and targeted diagnostics. See the
[date/time reference](../../docs/date-time.md).
