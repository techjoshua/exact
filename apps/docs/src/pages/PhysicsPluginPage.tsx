import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const engineSource = `const world = createPhysicsWorld({
  fixedStep: 1 / 120,
  maxCatchUpSteps: 8
});

const ball = world.createBody({
  shape: { kind: 'circle', radius: 24 },
  mass: 1,
  restitution: 0.82
});

ball.applyImpulse({ x: 180, y: -260 });`;

const componentSource = `<PhysicsWorld world={world} running={this.state.active}>
  <PhysicsElement body={ball}>
    <button aria-label="Launch ball" />
  </PhysicsElement>
</PhysicsWorld>`;

/** Documents deterministic worlds and optional body projection. */
export function PhysicsPluginPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin / @exactjs/physics"
			title="Simulate first, project second"
			description="A deterministic DOM-independent 2D engine owns bodies, forces, constraints, collisions, and fixed-step time; an ordinary eXact component optionally projects coalesced poses."
			previous={{ path: '/plugins/gestures', label: 'Gestures' }}
			next={{ path: '/plugins/microfrontends', label: 'Microfrontends' }}
		>
			<section>
				<h2>Keep simulation deterministic</h2>
				<CodeBlock source={engineSource} language="ts" title="scene.ts" />
				<p>
					Commands become visible at fixed-step boundaries. Catch-up is bounded and inspectable,
					while manual stepping uses the same solver in tests, workers, servers, and offline tools.
				</p>
			</section>
			<section>
				<h2>Use ordinary component ownership</h2>
				<CodeBlock source={componentSource} language="tsx" title="BouncingBall.tsx" />
				<p>
					The world component owns one Activity-aware frame chain. The transparent body component
					uses its logical root, publishes body context, and detaches projection and collision work
					exactly once.
				</p>
			</section>
			<section>
				<h2>Compose visual channels safely</h2>
				<p>
					Position and angle use the individual CSS <code>translate</code> and <code>rotate</code>{' '}
					properties. Authored values are never silently overwritten, and <code>stateOnly</code>{' '}
					leaves projection to canvas, SVG, or ordinary reactive bindings.
				</p>
			</section>
			<section>
				<h2>Keep policy optional</h2>
				<p>
					The engine imports no gesture, gravity, or motion package. Named force contributors and
					body commands are the neutral seams for later composition.
				</p>
			</section>
		</Article>
	);
}
