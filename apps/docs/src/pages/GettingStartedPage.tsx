import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const createAppSource = `npm create @exactjs/exact-app@latest my-app`;

const configuredCreateAppSource = `npm create @exactjs/exact-app@latest my-app -- \\
  --bundler vite \\
  --runtime browser \\
  --test-runner vitest \\
  --skill`;

const generatedAppSource = `import type { Component } from '@exactjs/core';

export function App(this: Component<{ count: number }>) {
  this.state.count = 0;

  return () => (
    <main>
      <h1>eXact</h1>
      <p>Reactive TypeScript without a virtual DOM.</p>
      <button onClick={() => this.state.count++}>
        Count: {this.state.count}
      </button>
    </main>
  );
}`;

/** Presents the supported create-exact-app workflow and first development commands. */
export function GettingStartedPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Start here"
			title="Create an eXact app"
			description="The official scaffolder creates a working project with compatible public package versions, compiler integration, runtime wiring, tests, and optional agent guidance."
			previous={{ path: '/story', label: 'The story behind eXact' }}
			next={{ path: '/runtimes', label: 'Runtimes & integrations' }}
		>
			<section>
				<h2>1. Run the scaffolder</h2>
				<p>
					Use npm&apos;s <code>create</code> command to run the latest released version of{' '}
					<code>@exactjs/create-exact-app</code>. The generated package manifest uses the eXact
					package versions that belong to that release—there are no repository-only{' '}
					<code>workspace:</code> dependencies to replace.
				</p>
				<CodeBlock source={createAppSource} language="shell" title="Terminal" compact />
			</section>

			<section>
				<h2>2. Choose the shape of the application</h2>
				<p>
					The interactive prompts cover the compiler integration, deployment runtime, test runner,
					and whether to include the eXact Agent Skill. Accept the defaults for a browser
					application using Vite and Vitest, or select the platform you intend to deploy.
				</p>
				<Callout title="Repeatable setup" tone="tip">
					<p>
						For scripts and tutorials, pass the choices as flags. This example produces the same
						default browser application without relying on interactive answers.
					</p>
				</Callout>
				<CodeBlock
					source={configuredCreateAppSource}
					language="shell"
					title="Non-interactive choices"
				/>
			</section>

			<section>
				<h2>3. Start the application</h2>
				<p>
					If you let the scaffolder install dependencies, the project is ready immediately.
					Otherwise, run <code>npm install</code> first.
				</p>
				<CodeBlock source={`cd my-app\nnpm run dev`} language="shell" title="Terminal" compact />
			</section>

			<section>
				<h2>4. Open the generated component</h2>
				<p>
					The starter deliberately contains ordinary-looking TSX: setup initializes inspectable
					state once, and the returned view keeps the button text connected to that state.
				</p>
				<CodeBlock source={generatedAppSource} language="tsx" title="src/App.tsx" />
			</section>

			<section>
				<h2>What the scaffolder configured</h2>
				<p>
					The generated project already tells TypeScript that eXact owns JSX and installs the
					compiler integration for the selected bundler. It can also generate server wiring and a
					runner-appropriate component test. You can inspect and change every generated file; the
					scaffolder is a starting point, not a hidden runtime dependency.
				</p>
				<Callout title="One native compiler for your platform" tone="tip">
					<p>
						The compiler package is a small JavaScript host. npm selects one native binary for your
						operating system and architecture from the platform packages declared by{' '}
						<code>@exactjs/compiler</code>; it does not install all six targets or the retired
						JavaScript compiler.
					</p>
				</Callout>
				<p>
					TypeScript 7 remains the application&apos;s editor and command-line type-checker. The
					persistent native compiler owns its pinned TypeScript-Go version independently, so there
					is no compiler-backend option to add to the generated Vite, Webpack, or Bun configuration.
				</p>
			</section>
		</Article>
	);
}
