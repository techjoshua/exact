import type { Component } from '@exactjs/core';

/** Introduces tasks through the work an application needs to run and cancel. */
export function TaskIntroduction(this: Component<{}>) {
	return () => (
		<section>
			<h2>Work that belongs to a component</h2>
			<p>
				A search box loads results when its text changes. A Save button sends the current draft to a
				server. Both operations need a way to report that they are running and to stop when the
				component is removed. eXact represents this work as a <strong>task</strong>.
			</p>
			<p>
				Write a task as a function inside the component. eXact connects it to the component’s state
				and manages each run. It can recognize tasks from operations such as browser storage access,
				or you can add a <code>TaskContext</code> parameter to choose how the task runs. Pure
				calculations can remain ordinary helper functions.
			</p>
			<p>
				A call in the component body can run again when its reactive arguments change. A call in an
				event handler runs for that event. The examples below show both forms before introducing
				scheduling and server execution.
			</p>
		</section>
	);
}
