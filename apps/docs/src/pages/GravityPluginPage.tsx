import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const fieldSource = `const planet = pointGravity({
  name: 'Planet',
  position: { x: 400, y: 300 },
  strength: 120_000,
  softening: 12,
  maxAcceleration: 4_000
});`;

const componentSource = `<PhysicsWorld world={world}>
  <GravityField field={planet} groups={['satellites']}>
    <Scene />
  </GravityField>
</PhysicsWorld>`;

/** Documents pure gravity fields and physics force registration. */
export function GravityPluginPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin / @exactjs/gravity"
			title="Compose acceleration without another simulation"
			description="Pure finite fields can be sampled anywhere, while ordinary components register named force contributors into an existing deterministic physics world."
			previous={{ path: '/plugins/physics', label: 'Physics' }}
			next={{ path: '/plugins/microfrontends', label: 'Microfrontends' }}
		>
			<section>
				<h2>Prepare bounded field math</h2>
				<CodeBlock source={fieldSource} language="ts" title="planet.ts" />
				<p>
					Uniform, directional, point, radial, bounded, and composite fields are immutable and
					browser-independent. Positive softening and acceleration caps prevent singular output.
				</p>
			</section>
			<section>
				<h2>Register through physics</h2>
				<CodeBlock source={componentSource} language="tsx" title="OrbitScene.tsx" />
				<p>
					Gravity adds one ordered force contributor and no loop. Stable body groups, collision
					layers, explicit sets, and predicates select bodies; independent registrations add and
					dispose independently.
				</p>
			</section>
			<section>
				<h2>Compose on one target</h2>
				<p>
					The transparent body enhancement consumes <code>PhysicsBodyContext</code>. It can apply a
					field to that body or use the simulated body pose as a moving attractor without measuring
					the DOM.
				</p>
			</section>
		</Article>
	);
}
