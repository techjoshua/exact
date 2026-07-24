import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { docPages } from '../docs-manifest.js';

export function DocsSearch(this: Component<{ query: string }>, props: { onClose(): void }) {
	this.state.query = '';

	const close = () => {
		this.state.query = '';
		props.onClose();
	};

	return () => {
		const query = this.state.query.trim().toLowerCase();
		const matches = query
			? docPages.filter((page) =>
					`${page.label} ${page.summary} ${page.keywords}`.toLowerCase().includes(query)
				)
			: docPages;

		return (
			<div className="search-backdrop" role="presentation">
				<section
					className="search-dialog"
					role="dialog"
					aria-modal="true"
					aria-label="Search documentation"
				>
					<div className="search-input-row">
						<label>
							<span className="visually-hidden">Search documentation</span>
							<input
								autofocus
								type="search"
								placeholder="Search components, tasks, routing\u2026"
								value:input={this.state.query}
							/>
						</label>
						<button type="button" onClick={close}>
							Close
						</button>
					</div>
					<div className="search-results">
						{matches.map((page) => (
							<Link className="search-result" to={page.path} onClick={close}>
								<strong>{page.label}</strong>
								<span>{page.summary}</span>
							</Link>
						))}
						{matches.length === 0 ? <p className="empty-search">No matching page yet.</p> : null}
					</div>
				</section>
			</div>
		);
	};
}
