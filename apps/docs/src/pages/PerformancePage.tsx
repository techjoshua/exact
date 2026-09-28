import streamReport from '../data/ssr-stream-report.json' with { type: 'json' };
import type { Component } from '@exactjs/core';
import reportJson from '../data/performance-report.json' with { type: 'json' };
import { Article } from './Article.jsx';
import { MetricSection, ValueSection, ResponseComposition } from './PerformanceFigures.jsx';
import { HeapComposition } from './HeapComposition.jsx';
import { SsrCapacity } from './SsrCapacity.jsx';

import type { PerformanceReport } from '../data/performance-report-types.js';

const report = reportJson as unknown as PerformanceReport;

/** Presents the latest admitted performance evidence without rerunning or renormalizing it. */
export function PerformancePage(this: Component<{}>) {
	this.onMount(({ signal }) => {
		const followSection = () => {
			const id = window.location.hash.split('#')[2];
			if (
				id &&
				['browser-experience', 'server-throughput', 'server-response', 'response-size'].includes(id)
			) {
				queueMicrotask(() => {
					if (!signal.aborted) focusSection(id);
				});
			}
		};
		window.addEventListener('hashchange', followSection, { signal });
		followSection();
	});

	return () => (
		<Article
			eyebrow="Framework comparison"
			title="Browser experience and server capacity"
			description="Compare page loading, interaction response, memory use, and server throughput for the same application."
			previous={{ path: '/framework-comparison', label: 'Framework comparison' }}
			next={{ path: '/examples/logo-lab', label: 'Logo lab' }}
		>
			<section>
				<h2>What the applications do</h2>
				<p>
					Each framework implements the same incident dashboard. A visitor loads the page, claims an
					incident, and sees the server confirm the change. The applications share data and styling,
					and must pass the same behavior checks before measurement.
				</p>
				<p>
					The charts answer four questions: how soon content appears, how quickly clicks receive
					feedback, how much memory the application retains, and how many pages the server can
					deliver. Results describe this workload on the recorded machine. Start with the group
					closest to your application’s needs.
				</p>
				<p>
					The dashboard uses shared static styling. It does not measure server-side generation of
					<code>theme:scope</code> palettes. That work currently adds substantial cost to the themed
					shipping example, so these throughput figures should not be used to estimate its capacity.
					The{' '}
					<a href="https://github.com/techjoshua/exact/blob/main/docs/performance.md#additional-release-checks-and-theme-cost">
						separate theme findings
					</a>
					describe that measurement and its limits.
				</p>
				<ul>
					<li>
						<a
							href="#/performance#browser-experience"
							onClick={(event) => refocusCurrentSection(event, 'browser-experience')}
						>
							Page loading and interactions
						</a>
					</li>
					<li>
						<a
							href="#/performance#server-throughput"
							onClick={(event) => refocusCurrentSection(event, 'server-throughput')}
						>
							Server throughput under load
						</a>
					</li>
					<li>
						<a
							href="#/performance#server-response"
							onClick={(event) => refocusCurrentSection(event, 'server-response')}
						>
							Server response time and memory
						</a>
					</li>
					<li>
						<a
							href="#/performance#response-size"
							onClick={(event) => refocusCurrentSection(event, 'response-size')}
						>
							Response size
						</a>
					</li>
				</ul>
			</section>
			<section>
				<h2>How eXact reduces work and waiting</h2>
				<p>
					Claiming an incident changes a few values on the dashboard. eXact’s compiler connects
					those values to the calculations and DOM that use them, so the browser can update the
					affected parts directly. That saves work as the rest of the dashboard grows.
				</p>
				<p>
					A page can also wait unnecessarily if rendering starts independent data requests one after
					another. During server-side rendering (SSR), eXact starts tasks when their inputs are
					ready and a concurrency slot is available. Supported compiled components can start
					independent child work while earlier requests are still running. The requests overlap, and
					the HTML stays in page order. Work that needs another task’s result still waits for it.
				</p>
				<p>
					The Node adapter helps the server deliver finished pages while it renders more. It
					monitors event-loop delay and how quickly responses complete, then adjusts how many
					rendering jobs it starts together and when to yield for network I/O. This addresses
					scheduling overhead. The time spent in your database or external services still matters.
				</p>
				<p>
					These charts measure complete applications with their normal framework behavior. They do
					not isolate the contribution of each optimization. The
					<a href="https://github.com/techjoshua/exact/blob/main/docs/performance.md#how-exact-reduces-work-and-waiting">
						performance reference
					</a>
					explains scheduling limits and related approaches in other frameworks.
				</p>
			</section>
			<section>
				<h2>Read the chart marks</h2>
				<p>
					The mean is the average of all samples. P50 is the median: half the samples are at or
					below it. P95 means 95% are at or below that value. P99 shows the slowest end of the
					measured distribution. Range charts span P50 to P99 and mark P75, P95, and the mean. Open
					a chart’s table for exact values.
				</p>
				<p>
					Lower times, memory use, and response sizes are generally preferable for the same work.
					Higher requests per second mean greater throughput. Read throughput together with latency,
					errors, and requests that could not be sent: a busy server can finish more work while
					making each visitor wait longer.
				</p>
				<p className="performance-scroll-hint">
					On narrow screens, scroll charts and tables sideways to see all labels and values.
				</p>
			</section>

			<MetricSection
				id="browser-experience"
				title="Browser experience"
				description="These tests load a fresh page with its cache disabled, then claim an incident. Saved production HTML and assets are served by the same local server for every framework, so page-load timings exclude generating HTML on the server. Interactions call the same application service. The browser process stays running between samples."
				charts={report.browserCharts}
			/>
			<HeapComposition />
			<SsrCapacity />
			<MetricSection
				id="server-response"
				title={`Server response time and memory: Node ${report.metadata.ssrDiagnosticsEnvironment.runtimes.node}, string API`}
				description="Burst completion time measures how long all 16 requests take to finish, without replacements. Warm sequential latency measures one complete response at a time. The bounded retention run measures absolute Node heap after garbage collection. It is distinct from the amount allocated while handling requests."
				charts={[report.server.burst, report.server.sequential, report.server.retention]}
			/>
			<p>
				Sequential results include the runtime's HTTP client behavior. See
				<a href="#/runtimes">runtime compatibility notes</a> for platform-specific client and server
				behavior.
			</p>
			<MetricSection
				title={`Server response time and memory: Bun ${report.server.bun.runtime}, string API`}
				description="The same five-framework workload runs on Bun. All five participants use native Bun.serve: eXact's Bun adapter, React's string renderer, SvelteKit's Bun adapter, and Nitro's Bun preset for Nuxt and TanStack Start. Heap measurements cover JavaScriptCore, so they are not directly comparable to Node's V8 heap accounting."
				charts={[
					report.server.bun.burst,
					report.server.bun.sequential,
					report.server.bun.retention
				]}
			/>
			<details>
				<summary>Capture details</summary>
				<p className="performance-evidence-note">
					Bun server evidence captured{' '}
					<time dateTime={report.server.bun.createdAt}>{report.server.bun.createdAt}</time>, with{' '}
					{report.server.bun.sequentialSamples} sequential requests,{' '}
					{report.server.bun.burstSamples} bursts, and {report.server.bun.retentionCheckpoints}{' '}
					retained-heap checkpoints per framework.
				</p>
			</details>
			<MetricSection
				title={
					'Server response time and memory: Node ' +
					streamReport.metadata.ssrDiagnosticsEnvironment.runtimes.node +
					', streaming API'
				}
				description="Complete-response diagnostics using the streaming APIs of eXact, React, and TanStack Start, including complete document and hydration-data delivery. Nuxt and SvelteKit are unavailable for this lane."
				charts={[
					streamReport.server.burst,
					streamReport.server.sequential,
					streamReport.server.retention
				]}
			/>
			<MetricSection
				title={
					'Server response time and memory: Bun ' +
					streamReport.server.bun.runtime +
					', streaming API'
				}
				description="The same streaming-API workload on native Bun servers. These results are separate from string rendering and from the sustained capacity captures."
				charts={[
					streamReport.server.bun.burst,
					streamReport.server.bun.sequential,
					streamReport.server.bun.retention
				]}
			/>
			<ValueSection
				id="response-size"
				title="Response payload: Node, string API"
				description="Complete response sizes include application markup and framework data. The composition chart separates semantic markup, document overhead, framework markers, identity attributes, and hydration data."
				charts={report.server.bars}
			/>
			<ResponseComposition figure={report.server.responseComposition} runtimeId="node" />
			<ValueSection
				title="Response payload: Bun, string API"
				description="Complete native Bun response sizes, including application markup and framework data."
				charts={report.server.bun.bars}
			/>
			<ResponseComposition figure={report.server.bun.responseComposition} runtimeId="bun" />

			<details>
				<summary>Capture details</summary>
				<p className="performance-evidence-note">
					Browser evidence commit <code>{report.metadata.commit}</code>. SSR capture hash
					<code>{report.metadata.ssrSourceSha256.slice(0, 12)}</code>, based on commit
					<code>{report.metadata.ssrCommit.slice(0, 8)}</code>. Browser evidence captured
					<time dateTime={report.metadata.browserCreatedAt}>
						{report.metadata.browserCreatedAt}
					</time>
					. Node response-time, payload, and server-memory evidence captured{' '}
					<time dateTime={report.metadata.ssrCreatedAt}>{report.metadata.ssrCreatedAt}</time>.
					Browser charts contain {report.metadata.browserSamples} samples per framework. Server
					latency charts contain {report.metadata.ssrSequentialSamples} sequential requests and
					{report.metadata.ssrBurstSamples} bursts per framework. Server memory uses
					{report.metadata.ssrRetentionCheckpoints} retained-heap checkpoints per framework.
					Capacity charts state their durations. Incomplete telemetry rejects publication. Request
					errors and missed arrivals remain visible. Unavailable GC telemetry does not mean zero
					collections.
				</p>
			</details>
			<section>
				<h2>How the comparison was run</h2>
				<p>
					Measurements used Linux Chromium under WSL 2 and native loopback networking. The same
					stylesheet and desktop and mobile appearance checks keep the visual work comparable. Node
					and Bun, and buffered and streaming response APIs, have separate results. Streaming
					measurements time complete responses. They do not measure when the first useful chunk
					appears.
				</p>
				<p>
					The streaming comparison includes eXact, React, and TanStack Start. The current Nuxt and
					SvelteKit applications do not expose an equivalent streaming document API. See the{' '}
					<a href="#/framework-comparison">methodology</a> for sample ordering, measurement limits,
					and reproduction commands.
				</p>
			</section>
		</Article>
	);
}

/** Moves reading and keyboard focus together to an article section. */
function focusSection(id: string): void {
	const section = document.getElementById(id);
	section?.scrollIntoView({ block: 'start' });
	section?.focus({ preventScroll: true });
}

/** Repeated clicks on the current fragment still scroll, without creating a history entry. */
function refocusCurrentSection(event: MouseEvent, id: string): void {
	if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
		return;
	if (window.location.hash !== `#/performance#${id}`) return;
	event.preventDefault();
	focusSection(id);
}
