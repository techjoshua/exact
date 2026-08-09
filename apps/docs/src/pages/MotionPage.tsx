import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const definitionSource = `import { defineMotion } from '@exactjs/motion';

export const dialogMotion = defineMotion({
  enter: {
    keyframes: [
      { opacity: 0, transform: 'translateY(8px) scale(.98)' },
      { opacity: 1, transform: 'none' }
    ]
  },
  leave: {
    keyframes: [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateY(6px) scale(.98)' }
    ]
  },
  reduced: 'skip'
});`;

const componentSource = `<MotionConfig reducedMotion="system" transition={{ duration: 160 }}>
  <Presence when={this.state.open} returnFocus={this.ref.openButton} mode="out-in">
    <Motion as="dialog" motion={dialogMotion} appear className="dialog">
      <DialogContents />
    </Motion>
  </Presence>
</MotionConfig>`;

const enhancementSource = `import motion from '@exactjs/motion'
  with { type: 'exact-enhancement' };
import { slideUp } from '@exactjs/motion/presets';

// Ordinary JSX remains the functional fallback.
<output motion:apply={slideUp}>Changes saved</output>

<span
  style={{ transform: indicatorTransform }}
  motion:change={indicatorChange}
/>`;

const listSource = `<LayoutGroup id="cards">
  <MotionList items={this.state.cards} getKey={(card) => card.id} exitLayout="pop">
    {(card) => (
      <Motion as="article" motion={cardMotion} layout="position" layoutId={card.id}>
        {card.title}
      </Motion>
    )}
  </MotionList>
</LayoutGroup>`;

/** Documents the current optional motion package surface and ownership model. */
export function MotionPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component library / @exactjs/motion"
			title="Keep state authoritative while tasks own motion"
			description="Prepared definitions describe visual behavior. Durable eXact components own playback, cancellation, root release, and inherited reduced-motion policy."
			previous={{ path: '/components/trust', label: 'Server trust' }}
			next={{ path: '/components/gestures', label: 'Gestures' }}
		>
			<section>
				<h2>Prepare visual behavior once</h2>
				<CodeBlock source={definitionSource} language="ts" title="dialog-motion.ts" />
				<p>
					Definitions are validated, checked for settling-safe timing, and frozen. Keep them at
					module scope, or use the small preset set from <code>@exactjs/motion/presets</code>, so
					reactive updates do not accidentally recreate visual policy. Reduced-motion policy uses an
					explicit reduced phase or completes visual work immediately.
				</p>
				<p>
					Enter/change phases may deliberately loop. Those loops detach from structural settlement
					but remain component-owned; leave, Activity parking, and disposal cancel them. Leave
					phases and the low-level <code>animate()</code> helper stay finite.
				</p>
				<p>
					Later reactive insertions run enter automatically. Initial rendering and hydration skip it
					unless <code>appear</code> opts in. Release reversal retains the same generation and runs
					enter from the interrupted computed frame instead of jumping to its first keyframe.
				</p>
				<p>
					An attributed <code>motion:change</code> stays subscribed on a persistent target even when
					that target has no enter phase. Ordinary reactive styles therefore remain authoritative
					while the enhancement supplies the visual path between committed values.
				</p>
			</section>
			<section>
				<h2>Enhance ordinary elements first</h2>
				<CodeBlock source={enhancementSource} language="tsx" title="SaveFeedback.tsx" />
				<p>
					The namespaced form attaches the same transparent motion owner to an existing intrinsic
					target. Remove the bundled capability and the output, styles, events, and application
					state still work; only the visual path disappears. This is the preferred form when motion
					is a progressive enhancement rather than required structure.
				</p>
			</section>
			<section>
				<h2>Coordinate conditional presence</h2>
				<CodeBlock source={componentSource} language="tsx" title="Dialog.tsx" />
				<p>
					Use explicit components when a compilerless caller needs motion or when components such as
					<code>Presence</code>, <code>MotionConfig</code>, and <code>MotionList</code> own
					structural coordination rather than decorating one existing target. <code>Motion</code>
					renders one real intrinsic selected by <code>as</code>. <code>MotionConfig</code> inherits
					enabled, transition, appear, and reduced-motion policy through the logical component tree,
					including portals. <code>Presence</code> makes leaving content inert, returns focus, and
					reuses the same DOM generation after a rapid reversal. Its sync, out-in, and in-out modes
					order keyed replacements through the existing release lifecycle. In-out waits for
					descendant enter playback before releasing the old range, and reduced-motion skips advance
					through the same state machine immediately.
				</p>
			</section>
			<section>
				<h2>Preserve keyed identity</h2>
				<CodeBlock source={listSource} language="tsx" title="CardList.tsx" />
				<p>
					<code>MotionList</code> uses eXact&apos;s reactive keyed-list primitive directly.
					Application state remains authoritative, keyed DOM survives reorder, and duplicate keys
					fail immediately. <code>LayoutGroup</code> measures those stable participants and plays
					additive FLIP transforms after movement; <code>exitLayout=&quot;pop&quot;</code> removes
					leaving items from layout while their retained generation settles.
				</p>
			</section>
			<section>
				<h2>Playback remains structured work</h2>
				<p>
					Finite playback opens an immediate, nonblocking task frame and remains structurally
					attached to its cause. Root-release leave motion therefore delays physical removal without
					giving application code a retention token. Cancellation propagates through the same task
					tree. Leave cancels active enter/change work first, and Activity parking cancels visual
					work without inventing a leave transition.
				</p>
				<p>
					The bundled runtime uses a browser-safe Web Animations driver by default, so explicit
					components and attributed motion work without a separate host lifecycle. Server imports do
					not read browser globals, and application or test drivers can still override playback with
					owned leases.
				</p>
			</section>
		</Article>
	);
}
