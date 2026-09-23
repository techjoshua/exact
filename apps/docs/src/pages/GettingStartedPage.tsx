import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const createAppSource = `npm create @exactjs/exact-app@latest my-app`;

const configuredCreateAppSource = `npm create --yes @exactjs/exact-app@latest my-app -- \\
  --bundler vite \\
  --runtime browser \\
  --test-runner vitest \\
  --skill --yes`;

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
			next={{ path: '/react-developers', label: 'eXact for React developers' }}
		>
			<section>
				<h2>1. Run the scaffolder</h2>
				<p>Use scaffolder version 0.5.1 or newer for this installation and build flow.</p>
				<p>
					Use npm&apos;s <code>create</code> command to run the latest released version of
					<code>@exactjs/create-exact-app</code>. The generated package manifest uses the eXact
					compatible package ranges selected by the scaffolder. There are no repository-only
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
				<p>
					The optional skill is installed at <code>.agents/skills/exact-web-development</code>. For
					Claude Code, expose that directory at <code>.claude/skills/exact-web-development</code>.
					The{' '}
					<a href="https://github.com/techjoshua/exact/tree/main/agents/exact-skill#claude-code">
						installation guide
					</a>
					includes symlink instructions for root and nested applications, plus a copy alternative.
				</p>
				<Callout title="Repeatable setup" tone="tip">
					<p>
						For scripts and tutorials, pass the choices as flags. This example produces the same
						default browser application without relying on interactive answers. The first --yes
						accepts npm's download prompt; the last accepts scaffolder defaults.
					</p>
				</Callout>
				<p>
					For one offline browser file, add{' '}
					<code>--output single-file --runtime browser --bundler vite</code>. The build embeds
					scripts, styles, imported images, and fonts into <code>dist/index.html</code>. Open it
					directly from disk and use hash navigation. Import assets through Vite; server operations
					and unembedded dependencies are rejected. File-origin browser API limits still apply.
					These output options target the 0.6.0 package family.
				</p>

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
				<h2>5. Check and build</h2>
				<CodeBlock
					source={`npm run typecheck\nnpm test\nnpm run build`}
					language="shell"
					title="Terminal"
					compact
				/>
				<p>
					Skip npm test if you selected no test runner. The browser build is written to{' '}
					<code>dist/</code>. With Vite, use <code>npm run preview</code> to try the production
					output locally; deploy that directory to your static host.
				</p>
				<p>
					The Bun development server rebuilds edited source; refresh the browser to see changes.
					With Vite, a server runtime defaults to SSR and hydration, generated registration, assets,
					and a continuation endpoint. Run <code>npm start</code> after building the Node starter.
					It includes a container example and guidance for sibling TypeScript workspace packages.
					Use <code>--operations-only</code> for a transport-only starter. Webpack and Bun server
					projects currently require that opt-out. The CLI checks this selection before asking the
					remaining setup questions and shows the required flag.
				</p>
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
						operating system and architecture from the platform packages declared by
						<code>@exactjs/compiler</code>.
					</p>
				</Callout>
				<p>
					TypeScript 7 provides editor support. Run <code>npm run typecheck</code> to check the
					application through <code>exactc --check --project tsconfig.json</code>, including
					compiler-owned TSX. Ordinary TypeScript rules still apply to property operations,
					including guarded deletes of optional properties. The persistent native compiler owns its
					pinned native TypeScript version independently, so there is no compiler-backend option to
					add to the generated Vite, Webpack, or Bun configuration.
				</p>
			</section>
		</Article>
	);
}
