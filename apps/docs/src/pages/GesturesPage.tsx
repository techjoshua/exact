import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const definitionSource = `const movable = defineGesture({
  name: 'movable-card',
  semantics: 'control',
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

const enhancementSource = `import gesture from '@exactjs/gestures'
  with { type: 'exact-enhancement' };

// Click remains the required behavior; movement is optional.
<button onClick={() => openCard(card.id)} gesture:apply={movable}>
  Open or move card
</button>`;

const explicitSource = `<GestureElement apply={movable}>
  <article tabIndex={0} aria-label="Move card">
    Drag me or use the arrow keys
  </article>
</GestureElement>`;

/** Documents prepared semantic input and component-owned gesture sessions. */
export function GesturesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component library / @exactjs/gestures"
			title="Recognize intent, preserve ownership"
			description="Prepared recognizers normalize pointer, hover, focus, keyboard, and pinch input while one durable component session owns capture, cancellation, coalescing, and cleanup."
			previous={{ path: '/components/motion', label: 'Motion' }}
			next={{ path: '/components/physics', label: 'Physics' }}
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
				<h2>Add optional intent without replacing controls</h2>
				<CodeBlock source={enhancementSource} language="tsx" title="CardButton.tsx" />
				<p>
					The button remains a button and its click remains the fallback. When the capability is
					bundled, one transparent gesture component additionally owns pointer capture, keyboard
					movement, cancellation, and cleanup. Omitting it removes that extra intent without
					changing the control&apos;s design or required action.
				</p>
			</section>
			<section>
				<h2>Make required gesture behavior explicit</h2>
				<CodeBlock source={explicitSource} language="tsx" title="MovableCard.tsx" />
				<p>
					Use <code>GestureElement</code> when gesture behavior is part of the component&apos;s
					contract or the caller is compilerless. Unlike the optional attribute, that component and
					its behavior are always part of the authored tree.
				</p>
			</section>
			<section>
				<h2>Bound input work</h2>
				<p>
					Priority and thresholds arbitrate competing recognizers. Slow move callbacks retain only
					the latest pending sample. Synchronous return values are ignored, while returned thenables
					are awaited before that pending sample runs. Capture loss, blur, deactivation, disabling,
					and disposal cancel the named session and restore browser policy.
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
