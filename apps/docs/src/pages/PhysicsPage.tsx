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

const enhancementSource = `import physics from '@exactjs/physics'
  with { type: 'exact-enhancement' };

<PhysicsWorld world={world}>
  {/* Still a usable authored button when projection is excluded. */}
  <button physics:body={ball} onClick={() => ball.applyImpulse(launch)}>
    Launch
  </button>
</PhysicsWorld>`;

/** Documents deterministic worlds and optional body projection. */
export function PhysicsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component library / @exactjs/physics"
			title="Simulate first, project second"
			description="Simulate moving bodies and collisions, then display their positions in a component."
			previous={{ path: '/components/gestures', label: 'Gestures' }}
			next={{ path: '/components/gravity', label: 'Gravity' }}
		>
			<section>
				<h2>Create and step a simulation</h2>
				<p>
					A world holds the simulated bodies. Create a world, add a body with its physical
					properties, and advance time to calculate movement. The first example runs the simulation
					independently of page rendering.
				</p>
				<CodeBlock source={engineSource} language="ts" title="scene.ts" />
				<p>
					A simulation advances in fixed time steps. Body commands take effect at the next step, so
					the same inputs and steps produce repeatable results. You can step it manually in a test
					or use a component to advance it while the view is active.
				</p>
			</section>
			<section>
				<h2>Make an element follow a body</h2>
				<CodeBlock source={enhancementSource} language="tsx" title="OptionalBall.tsx" />
				<p>
					The world is required simulation ownership, while <code>physics:body</code> is an optional
					transparent projection wrapper. Without that capability the authored button and click
					still work; the DOM simply stops following the body. This lets a design component remain
					ignorant of the projection implementation.
				</p>
			</section>
			<section>
				<h2>Manage a simulation with components</h2>
				<CodeBlock source={componentSource} language="tsx" title="BouncingBall.tsx" />
				<p>
					Use the explicit <code>PhysicsElement</code> when DOM attachment is required behavior or
					where enhancement attributes are unavailable. The world component owns one Activity-aware
					frame chain, and the body component uses its logical root, publishes body context, and
					detaches projection and collision work exactly once.
				</p>
			</section>
			<section>
				<h2>Combine simulation with CSS</h2>
				<p>
					Position and angle use the individual CSS <code>translate</code> and <code>rotate</code>
					properties. Authored values are never silently overwritten, and <code>stateOnly</code>
					leaves projection to canvas, SVG, or ordinary reactive bindings.
				</p>
			</section>
			<section>
				<h2>Add forces and other behavior</h2>
				<p>
					The engine imports no gesture, gravity, or motion package. Named force contributors and
					body commands are the neutral seams for later composition.
				</p>
			</section>
		</Article>
	);
}
