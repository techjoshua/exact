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
			description="Load server credentials and prevent secret values from being sent to the browser."
			previous={{ path: '/components/trust', label: 'Server trust' }}
			next={{ path: '/plugins/microfrontends', label: 'Microfrontends' }}
		>
			<section>
				<h2>Keep credentials on the server</h2>
				<p>
					A database password must stay on the server even when it is passed through a helper or
					combined into a connection string. <code>{'Secret<T>'}</code> marks a value for the
					compiler to track. Expressions derived from it remain secret, and attempts to send them to
					browser code are rejected.
				</p>
			</section>
			<section>
				<h2>Declare required secrets</h2>
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
				<h2>Pass a secret to a trusted library</h2>
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
				<h2>Load and release secrets</h2>
				<p>
					The plugin prepares its resolver for the server projection, initializes providers at
					application startup, validates required values, and clears resolved values on disposal.
					The compiler projection receives only a bounded policy cache key and allowlist. Loaded
					secret values stay on the server.
				</p>
			</section>
		</Article>
	);
}
