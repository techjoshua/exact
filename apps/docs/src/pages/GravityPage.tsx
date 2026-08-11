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

const enhancementSource = `import gravity from '@exactjs/gravity'
  with { type: 'exact-enhancement' };
import physics from '@exactjs/physics'
  with { type: 'exact-enhancement' };

<PhysicsWorld world={world}>
  <div physics:body={satellite} gravity:apply={planet} />
</PhysicsWorld>`;

/** Documents pure gravity fields and physics force registration. */
export function GravityPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component library / @exactjs/gravity"
			title="Compose gravity fields"
			description="Pure finite fields can be sampled anywhere, while ordinary components register named force contributors into an existing deterministic physics world."
			previous={{ path: '/components/physics', label: 'Physics' }}
			next={{ path: '/plugins', label: 'Plugin system' }}
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
				<h2>Add force policy to an existing body target</h2>
				<CodeBlock source={enhancementSource} language="tsx" title="Satellite.tsx" />
				<p>
					The physics enhancement publishes body context and the gravity enhancement consumes it on
					the same authored element. If gravity is excluded, the body still exists and projects; it
					simply receives no contribution from that field. Neither capability owns the
					element&apos;s design.
				</p>
			</section>
			<section>
				<h2>Register through physics</h2>
				<CodeBlock source={componentSource} language="tsx" title="OrbitScene.tsx" />
				<p>
					Use <code>GravityField</code> when scene-wide gravity is required or selection is broader
					than one target. Gravity adds one ordered force contributor and no loop. Stable body
					groups, collision layers, explicit sets, and predicates select bodies; independent
					registrations add and dispose independently.
				</p>
			</section>
			<section>
				<h2>Compose on one target</h2>
				<p>
					The transparent body enhancement consumes <code>PhysicsBodyContext</code>. It can apply a
					field to that body or use the simulated body pose as a moving attractor without measuring
					the DOM.
				</p>
				<p>
					Component-owned registrations exist only while active. A parked Activity subtree keeps its
					configuration but contributes no force until it resumes.
				</p>
			</section>
		</Article>
	);
}
