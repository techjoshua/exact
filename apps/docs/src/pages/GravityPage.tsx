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
			description="Apply uniform gravity or attraction fields to bodies in a physics simulation."
			previous={{ path: '/components/physics', label: 'Physics' }}
			next={{ path: '/plugins', label: 'Plugin system' }}
		>
			<section>
				<h2>Choose a gravity field</h2>
				<p>
					A field calculates acceleration at a position. The example creates a field that can later
					be attached to bodies in a <a href="#/components/physics">physics world</a>. Start with
					that guide if you have not created a simulation yet.
				</p>
				<CodeBlock source={fieldSource} language="ts" title="planet.ts" />
				<p>
					Choose a uniform field for constant acceleration, or a point or radial field for
					attraction around a location. Fields can be combined or limited to a region. Softening
					limits the force near an attractor, and an acceleration cap prevents extreme values.
				</p>
			</section>
			<section>
				<h2>Apply a field to one body</h2>
				<CodeBlock source={enhancementSource} language="tsx" title="Satellite.tsx" />
				<p>
					The physics enhancement publishes body context and the gravity enhancement consumes it on
					the same authored element. If gravity is excluded, the body still exists and projects. It
					simply receives no contribution from that field. Neither capability owns the
					element&apos;s design.
				</p>
			</section>
			<section>
				<h2>Apply gravity to a group of bodies</h2>
				<CodeBlock source={componentSource} language="tsx" title="OrbitScene.tsx" />
				<p>
					Use <code>GravityField</code> when scene-wide gravity is required or selection is broader
					than one target. Gravity adds one ordered force contributor and no loop. Stable body
					groups, collision layers, explicit sets, and predicates select bodies. Independent
					registrations add and dispose independently.
				</p>
			</section>
			<section>
				<h2>Move an attractor with a body</h2>
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
