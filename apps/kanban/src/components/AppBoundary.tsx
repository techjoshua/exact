import {
	ErrorContext,
	LoggerContext,
	createErrorContext,
	type Child,
	type Component,
	type ErrorReport,
	type Logger
} from '@exactjs/core';

type AppBoundaryState = {
	errors: ErrorReport[];
};

type AppBoundaryProps = {
	children?: Child | Child[];
	logger?: Logger;
};

/** Renders a recoverable error boundary around the kanban app. */
export function AppBoundary(this: Component<AppBoundaryState>, props: AppBoundaryProps) {
	this.state.errors = [];
	const errors = createErrorContext(this.state.errors);
	if (props.logger) this.setContext(LoggerContext, props.logger);
	this.setContext(ErrorContext, errors);

	const clearErrors = () => {
		errors.clearAll();
	};

	return () =>
		this.state.errors.length ? (
			<main className="shell">
				<section theme:surface="raised" className="error-panel" role="alert">
					<header>
						<div>
							<h1>Something went wrong</h1>
							<p>
								{this.state.errors.length} {this.state.errors.length == 1 ? 'error' : 'errors'}
								reported by the board.
							</p>
						</div>
						<button theme:action="quiet" type="button" onClick={clearErrors}>
							Return to board
						</button>
					</header>

					<div className="error-list">
						{this.state.errors.map((error) => (
							<article theme:status="danger" className="error-item">
								<h2>{error.component?.name ?? 'Application'}</h2>
								<p>
									{error.source}
									{error.phase ? `:${error.phase}` : ''}
								</p>
								<pre>{formatError(error.error)}</pre>
								<button theme:action="quiet" type="button" onClick={() => errors.clear(error)}>
									Clear
								</button>
							</article>
						))}
					</div>
				</section>
			</main>
		) : (
			props.children
		);
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.stack ?? error.message;
	return String(error);
}
