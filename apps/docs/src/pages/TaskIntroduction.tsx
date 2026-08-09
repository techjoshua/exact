import type { Component } from '@exactjs/core';

/** Introduces the task definition, activation, and generation vocabulary. */
export function TaskIntroduction(this: Component<{}>) {
	return () => (
		<section>
			<h2>Tasks are eXact&apos;s unit of coordinated work</h2>
			<p>
				An eXact component is a durable instance whose setup runs once. Some work associated with
				that instance must run again when an input changes, wait for asynchronous operations,
				publish state safely, respond to an interaction, or own a resource. A <strong>task</strong>
				is the framework&apos;s model for that coordinated work.
			</p>
			<p>
				In source, a task begins as an ordinary TypeScript function. The compiler recognizes when
				that function needs framework coordination from its effects, where it is called, known
				framework or platform APIs, transitive calls, or explicit policy. It gives the function a
				stable task definition owned by the component. A pure helper that needs none of this stays
				an ordinary JavaScript function.
			</p>
			<p>Three terms describe what happens next:</p>
			<ul>
				<li>
					The <strong>definition</strong> is the function-shaped unit the compiler discovers.
				</li>
				<li>
					An <strong>activation</strong> is the reason it runs: initialization, a reactive change,
					an interaction, lifecycle work, or direct invocation.
				</li>
				<li>
					A <strong>generation</strong> is one scheduled run, with its own cancellation signal,
					status, result, effects, children, resources, and cleanup.
				</li>
			</ul>
			<p>
				The scheduler runs generations according to their owner, activation, concurrency lane,
				priority, and readiness. This lets eXact cancel obsolete work, prevent stale state from
				publishing, attach child work structurally, expose useful status, and coordinate client,
				server, and Suspense behavior without rerunning the whole component.
			</p>
		</section>
	);
}
