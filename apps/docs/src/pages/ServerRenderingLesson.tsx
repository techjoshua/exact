/** Teaches SSR, hydration and the occurrence-owned children accessor contract. */
export function ServerRenderingLesson() {
	return () => (
		<section>
			<h2>Render the first result on the server</h2>
			<p>
				The product page can arrive with its product already visible. Server-side rendering (SSR)
				resolves the request context and runs the server work before sending the resulting HTML.{' '}
				<strong>Hydration</strong> connects the browser component to that HTML and restores the
				settled state, so it does not need to repeat the initial request. The server’s initial state
				stays in place while hydration adopts the DOM. Live client inputs drive subsequent updates.
			</p>
			<p>
				When a blocking server task updates component state, the first HTML includes those changes
				after the task succeeds. Later changes still use the same task. Selecting another product loads its data and updates
				the existing component. Independent tasks can start while earlier tasks are waiting, subject
				to request concurrency limits, while HTML stays in page order. Mixing component calls with
				ordinary child expressions preserves that order in string and streaming output.
			</p>
			<p>
				A refresh can update individual styles. When a style change produces too many individual
				patches, the framework sends an attribute or boundary replacement instead.
			</p>
			<p>
				Server rendering retains one children input for each accepted component execution. When
				children come from a <code>props.children</code>
				getter, eXact reads that getter once and uses its exact result for construction and
				publication. Other prop getters keep their original receiver. If one reads
				<code>this.children</code>, that authored read runs normally outside the framework
				acquisition. A fresh final streaming pass acquires its own children input, so effectful
				getters may run again for that execution. This affects accessor props that perform work when
				read. A retained child still receives updated inputs when a helper selects them from its
				parent’s reactive data.
			</p>
			<details>
				<summary>Sending HTML progressively</summary>
				<p>
					Progressive output can send a completed document head while body tasks are still running.
					The browser can discover stylesheets and scripts sooner. The body, hydration data, and
					closing tags follow in the same render. If pending work can change the head, or a
					transformation needs the complete output, eXact waits for that work first.
				</p>
				<p>
					HTML <code>template</code> descendants stay in the element’s native <code>content</code>
					fragment during hydration. A ref still names the template element. Use its
					<code>content</code> property to inspect or clone the stored markup.
				</p>
				<p>
					String and streaming output both support hydration of the existing DOM. For custom
					response handlers, see <a href="#/advanced">server rendering and hydration setup</a>.
					Result metadata arrays, such as preload links, follow TypeScript's compile-time readonly
					rules. The{' '}
					<a href="https://github.com/techjoshua/exact/blob/main/docs/ssr-hydration.md">
						SSR reference
					</a>{' '}
					covers publication, URL handling, and output limits. Native URL attributes block
					javascript protocols in server output and DOM updates. When a value needs string
					conversion, eXact publishes the same text it checked.
				</p>
				<p>
					When a custom handler cancels a document event, progressive HTML, or task-progress reader,
					awaiting cancellation also waits for the producer's owned cleanup to finish. Cancellation
					before queued task-progress production starts releases its resources without invoking that
					producer. Batch cancellation also prevents dependent operations from starting.
				</p>
				<p>
					An AbortSignal's exact reason, including null, reaches pending output reads and Express
					response writes waiting for drain. Component prop preparation preserves that reason too.
					If preparation fails while waiting for server work, it releases its waits and leaves
					shared sources available to other consumers.
				</p>
			</details>
		</section>
	);
}
