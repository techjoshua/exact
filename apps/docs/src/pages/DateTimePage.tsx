import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const countdownSource = `// exact.config.ts
export * as time from '@exactjs/time/enhancements' with {
  type: 'exact-enhancement',
  scope: 'package'
};

function Countdown(props: { deadline: Date }) {
  return () => (
    <time time:update>
      {Math.ceil((props.deadline.getTime() - Date.now()) / 1_000)}
    </time>
  );
}`;

const intlSource = `<p intl:message="release-time">
  Release:
  <time time:update="minute">
    {new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' }).format(
      Math.round((props.release.getTime() - Date.now()) / 60_000),
      'minute'
    )}
  </time>.
</p>`;

const controlSource = `<time time:update={this.state.live ? 'auto' : 'disabled'}>
  {Math.floor((Date.now() - props.startedAt.getTime()) / 1_000)}
</time>`;

const adaptiveSource = `function Elapsed(props: { startedAt: number }) {
  const seconds = Math.floor((Date.now() - props.startedAt) / 1_000);
  const minutes = Math.floor((Date.now() - props.startedAt) / 60_000);
  const hours = Math.floor((Date.now() - props.startedAt) / 3_600_000);

  return () => (
    <time time:update>
      {seconds < 60 ? \`${'${seconds}'}s\` : minutes < 60 ? \`${'${minutes}'}m\` : \`${'${hours}'}h\`} ago
    </time>
  );
}`;

/** Documents compiler-derived clock progression and its optional enhancement package. */
export function DateTimePage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component library / @exactjs/time"
			title="Time progresses without polling ceremony"
			description="Display clocks, countdowns, and relative dates that update as time passes."
			previous={{ path: '/components/charts', label: 'Charts' }}
			next={{ path: '/components/accessibility', label: 'Accessibility' }}
		>
			<section>
				<h2>Display a countdown</h2>
				<p>
					A countdown needs to refresh even when no application state changes. Setting up an
					interval means choosing how often to run it and remembering to stop it when the view
					disappears. With <code>time:update</code>, write the countdown using ordinary date
					subtraction and rounding. eXact schedules the display updates and releases that work with
					the component.
				</p>
				<CodeBlock source={countdownSource} language="tsx" title="Countdown.tsx" />
				<p>
					The expression subtracts the current time from a deadline to display how much time
					remains.
					<code>time:update</code> asks eXact to refresh that display when its value should change.
					Your expression determines rounding and what happens after zero. If the optional
					enhancement is disabled, the initial value is still rendered.
				</p>
				<p>
					Clock math may live directly in JSX, in safe component-body aliases, or in local pure
					TypeScript formatter functions. The compiler follows the formatter's call graph rather
					than requiring display strings to be assembled in JSX; opaque, imported, or effectful
					helpers produce an error. Ordinary durable children remain independent owners and opt in
					themselves.
				</p>
			</section>
			<section>
				<h2>Choose when the display updates</h2>
				<CodeBlock source={adaptiveSource} language="tsx" title="AdaptiveElapsed.tsx" />
				<p>
					Floor, ceiling, round, and truncation math keeps its authored anchor instead of drifting
					to mount-time or wall-clock boundaries. Finite conditions add their exact transition, so
					this view progresses from seconds to minutes to hours instead of retaining one refresh
					interval. Fixed accuracy ranges from milliseconds through hours; calendar policies cover
					day, week, month, and year boundaries. One scheduler per clock arms only the earliest
					deadline, waits for the resulting reactive and DOM work to settle, and coalesces missed
					time instead of accumulating interval callbacks.
				</p>
				<CodeBlock source={controlSource} language="tsx" title="Reactive suspension" />
				<p>
					A reactive <code>disabled</code> policy withdraws scheduling and retains the last sample
					while ordinary state and props continue to update. Reenabling samples current time once;
					Activity deactivation and range disposal release the same owned registration. Policy and
					anchor changes update those precise readers without rerendering the enclosing component or
					requiring a keyed remount.
				</p>
				<p>
					Automatic analysis also follows statically selected record and array members,
					destructuring, and prop-bearing lexical micro-views. Fixed-unit Temporal rounding from
					milliseconds through hours preserves its anchor, increment, and half-expand transitions on
					both sides of zero. Sub-millisecond precision and calendar-relative Temporal duration
					rounding require a narrower supported policy instead of receiving a silent approximation.
				</p>
			</section>
			<section>
				<h2>Format dates and durations</h2>
				<CodeBlock source={intlSource} language="tsx" title="LocalizedRelease.tsx" />
				<p>
					A nested clock range and its enclosing lexical message share one sample.
					Internationalization still owns translation and the cached native formatter; the time
					package owns clock sampling and progression and has no runtime dependency on Intl. Several
					nested ranges remain independent, while Intl's generated formatter projections alias the
					matching authored activation instead of creating another scheduler registration.
				</p>
			</section>
			<section>
				<h2>Supply a clock for your application or tests</h2>
				<p>
					Use <code>TimeProvider</code> for authoritative or simulated time. Clock, time zone,
					calendar, and week start are separate provider props. The testing entry exports a manual
					clock whose advancement, due-work publication, next deadline, and pending timer count are
					deterministic; tests do not need real sleeps or global <code>Date</code> patches. Server
					rendering never schedules a timer, and hydration adopts server output before its first
					live sample. The server snapshot is added to hydration data only for artifacts that
					consume the time capability.
				</p>
			</section>
			<section>
				<h2>Resolve update-policy errors</h2>
				<p>
					The package supplies update-policy completions plus activation summaries in hovers and
					inlay hints. It reports invalid policies, missing clocks, and unbounded automatic updates.
					Automatic mode never hides a millisecond or second polling fallback. Pass the current
					clock value into a pure helper so dependency analysis can safely repeat only the affected
					view; an explicit cadence does not make hidden clock reads safe.
				</p>
			</section>
		</Article>
	);
}
