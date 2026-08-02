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
export function MotionPluginPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin / @exactjs/motion"
			title="Keep state authoritative while tasks own motion"
			description="Prepared definitions describe finite visual paths. Durable eXact components own playback, cancellation, root release, and inherited reduced-motion policy."
			previous={{ path: '/plugins', label: 'Plugin system' }}
			next={{ path: '/plugins/gestures', label: 'Gestures' }}
		>
			<section>
				<h2>Prepare visual behavior once</h2>
				<CodeBlock source={definitionSource} language="ts" title="dialog-motion.ts" />
				<p>
					Definitions are validated, checked for finite timing, and frozen. Keep them at module
					scope, or use the small preset set from <code>@exactjs/motion/presets</code>, so reactive
					updates do not accidentally recreate visual policy. Reduced-motion policy uses an explicit
					reduced phase or completes visual work immediately.
				</p>
				<p>
					Later reactive insertions run enter automatically. Initial rendering and hydration skip it
					unless <code>appear</code> opts in, and release reversal does not replay enter.
				</p>
			</section>
			<section>
				<h2>Coordinate conditional presence</h2>
				<CodeBlock source={componentSource} language="tsx" title="Dialog.tsx" />
				<p>
					<code>Motion</code> renders one real intrinsic selected by <code>as</code>.{' '}
					<code>MotionConfig</code> inherits enabled, transition, appear, and reduced-motion policy
					through the logical component tree, including portals. <code>Presence</code> makes leaving
					content inert, returns focus, and reuses the same DOM generation after a rapid reversal.
					Its sync, out-in, and in-out modes order keyed replacements through the existing release
					lifecycle. In-out waits for descendant enter playback before releasing the old range, and
					reduced-motion skips advance through the same state machine immediately.
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
			</section>
			<section>
				<h2>Use attributes or explicit components</h2>
				<p>
					An attributed motion import enables typed <code>motion:*</code> attributes. Vite includes
					reached capabilities in the application bundle and supplies its local catalog to DOM,
					hydration, and SSR. Compilerless libraries can continue to use <code>Motion</code>{' '}
					directly.
				</p>
			</section>
		</Article>
	);
}
