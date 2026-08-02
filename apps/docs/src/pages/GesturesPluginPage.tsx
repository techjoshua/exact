import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const definitionSource = `const movable = defineGesture({
  name: 'movable-card',
  drag: {
    threshold: 4,
    onStart: () => this.state.dragging = true,
    onMove: (sample) => {
      this.state.position.x = this.state.origin.x + sample.delta.x;
      this.state.position.y = this.state.origin.y + sample.delta.y;
    },
    onEnd: () => this.state.dragging = false,
    onCancel: () => this.state.dragging = false
  },
  keyboard: {
    step: 8,
    onMove: ({ delta }) => {
      this.state.position.x += delta.x;
      this.state.position.y += delta.y;
    }
  },
  touchAction: 'none'
});`;

const usageSource = `<GestureElement apply={movable}>
  <article tabIndex={0} aria-label="Move card">
    Drag me or use the arrow keys
  </article>
</GestureElement>`;

/** Documents prepared semantic input and component-owned gesture sessions. */
export function GesturesPluginPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin / @exactjs/gestures"
			title="Recognize intent without owning application state"
			description="Prepared recognizers normalize pointer, hover, focus, keyboard, and pinch input while one durable component session owns capture, cancellation, coalescing, and cleanup."
			previous={{ path: '/plugins/motion', label: 'Motion' }}
			next={{ path: '/plugins/physics', label: 'Physics' }}
		>
			<section>
				<h2>Prepare policy once</h2>
				<CodeBlock source={definitionSource} language="ts" title="movable.ts" />
				<p>
					Semantic samples expose accumulated deltas, velocity, local coordinates, monotonic time,
					and cancellation. Ordinary component state remains the source of truth.
				</p>
			</section>
			<section>
				<h2>Make required behavior explicit</h2>
				<CodeBlock source={usageSource} language="tsx" title="MovableCard.tsx" />
				<p>
					Use the transparent explicit component when gesture behavior is functional. Optional
					namespaced attributes remain safe enhancement when the generated capability host is
					active.
				</p>
			</section>
			<section>
				<h2>Bound input work</h2>
				<p>
					Priority and thresholds arbitrate competing recognizers. Slow move callbacks retain only
					the latest pending sample, while capture loss, blur, deactivation, disabling, and disposal
					cancel the named session and restore browser policy.
				</p>
			</section>
			<section>
				<h2>Preserve keyboard parity</h2>
				<p>
					Control-like definitions need a keyboard recognizer, focusable target, accurate accessible
					name, and honest semantics. Gesture policy never manufactures a misleading role.
				</p>
			</section>
		</Article>
	);
}
