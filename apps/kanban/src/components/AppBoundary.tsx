import { ErrorContext, LoggerContext, type Child, type Component, type ErrorReport, type Logger } from "@exact/core";

type AppBoundaryState = {
  errors: ErrorReport[];
};

type AppBoundaryProps = {
  children?: Child | Child[];
  logger?: Logger;
};

export function AppBoundary(this: Component<AppBoundaryState>, props: AppBoundaryProps) {
  this.state.errors = [];
  if (props.logger) this.setContext(LoggerContext, props.logger);
  this.setContext(ErrorContext, this.state.errors);

  const clearErrors = () => {
    this.state.errors = [];
    this.setContext(ErrorContext, this.state.errors);
  };

  return () => this.state.errors.length
    ? (
      <main className="shell">
        <section className="error-panel" role="alert">
          <header>
            <div>
              <h1>Something went wrong</h1>
              <p>{this.state.errors.length} {this.state.errors.length == 1 ? "error" : "errors"} reported by the board.</p>
            </div>
            <button type="button" className="quiet-button" onClick={clearErrors}>
              Return to board
            </button>
          </header>

          <div className="error-list">
            {this.map(
              this.state.errors,
              error => error.id,
              error => (
                <article className="error-item">
                  <h2>{error.component?.name ?? "Application"}</h2>
                  <p>{error.source}{error.phase ? `:${error.phase}` : ""}</p>
                  <pre>{formatError(error.error)}</pre>
                </article>
              )
            )}
          </div>
        </section>
      </main>
    )
    : props.children;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}
