import { TaskContext, taskStatus, type Component } from '@exactjs/core';

const destinations = ['Lisbon', 'London', 'Los Angeles', 'Oslo', 'Paris', 'Portland'];
type SearchState = { query: string; results: string[] };

/** Demonstrates input-driven asynchronous work without requiring a server or API key. */
export function App(this: Component<SearchState>) {
	this.state.query = '';
	this.state.results = [];

	const search = async (query: string, _task: TaskContext = TaskContext.client()) => {
		// Simulate a slow first request and faster subsequent requests.
		await new Promise<void>((resolve) => {
			setTimeout(resolve, query.length === 1 ? 800 : 200);
		});
		this.state.results = query
			? destinations.filter((name) => name.toLowerCase().includes(query.toLowerCase()))
			: [];
	};
	void search(this.state.query);
	const status = taskStatus(search);

	return () => (
		<section aria-label="Destination search">
			<label>
				Destination
				<input type="search" value:onInput={this.state.query} />
			</label>
			<p role="status">{status.pending ? 'Searching…' : 'Search complete'}</p>
			<ul>
				{this.state.results.map((name) => (
					<li key={name}>{name}</li>
				))}
			</ul>
		</section>
	);
}
