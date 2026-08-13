import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const secretsConfigSource = `export default {
  plugins: {
    secrets(config) {
      // The default provider reads process.env and optional .env files.
      config.required.push('DATABASE_URL', 'STRIPE_SECRET_KEY');

      // Only named dependency packages may contain consume() boundaries.
      config.allowPackages.push('@acme/payments');
    }
  }
};`;

const secretsUseSource = `import { consume, type Secret } from '@exactjs/secrets';

declare const secrets: {
  require(name: string): Secret<string>;
};

const credential = secrets.require('STRIPE_SECRET_KEY');

// Secret qualification propagates through expressions.
const authorization = 'Bearer ' + credential;

// Deliberately end tracking in trusted server code.
const client = createStripeClient(consume(authorization));`;

/** Documents server-only secret providers and compiler-enforced consumption boundaries. */
export function SecretsPluginPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin / @exactjs/secrets"
			title="Make secrets explicit"
			description="The secrets plugin loads values through application-owned providers, validates required names at startup, and gives secret data a compiler-visible qualification that persists until trusted code explicitly consumes it."
			previous={{ path: '/plugins/microfrontends', label: 'Microfrontends' }}
			next={{ path: '/examples/logo-lab', label: 'Logo lab' }}
		>
			<section>
				<h2>Why a secret needs more than an environment lookup</h2>
				<p>
					Loading a value is the easy part. The harder question is where that value flows after
					loading: through string composition, helper calls, server output, client artifacts, or
					dependencies. A<code>{'Secret<T>'}</code> is the runtime value with a compile-time policy
					qualification, allowing eXact analysis to follow the concern beyond the provider call.
				</p>
			</section>
			<section>
				<h2>Configure providers and policy once</h2>
				<CodeBlock source={secretsConfigSource} language="ts" title="exact.config.ts" />
				<p>
					The built-in environment provider reads process environment values and optional
					<code>.env</code>
					files. Applications can add providers implementing the same async interface. Later
					providers replace earlier values with the same name, and startup fails when a required
					name remains missing.
				</p>
			</section>
			<section>
				<h2>Consumption is an audited decision</h2>
				<CodeBlock source={secretsUseSource} language="ts" title="payments.server.ts" />
				<p>
					Passing a qualified secret to an ordinary parameter is rejected unless that parameter
					explicitly accepts <code>{'Secret<T>'}</code>. <code>consume()</code> ends tracking at a
					deliberate server boundary. For dependency code, the package containing that call must
					also appear in
					<code>allowPackages</code>; trust does not automatically spread to its downstream
					consumers.
				</p>
			</section>
			<section>
				<h2>Lifecycle belongs to the server host</h2>
				<p>
					The plugin prepares its resolver for the server projection, initializes providers at
					application startup, validates required values, and clears resolved values on disposal.
					The compiler projection receives only a bounded policy cache key and allowlist—not the
					loaded secret values.
				</p>
			</section>
		</Article>
	);
}
