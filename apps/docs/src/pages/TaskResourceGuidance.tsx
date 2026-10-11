/** Explains resource ownership and native cleanup boundaries for task authors. */
export function TaskResourceGuidance() {
	return () => (
		<details>
			<summary>Custom data clients and cleanup methods</summary>
			<p>
				For a subscription that lasts while the component is mounted, open it from an ordinary
				<code>onMount</code> callback and pass the mount signal to its helper. Keep that helper free
				of a <code>TaskContext</code> policy parameter so it retains the component lifetime.
			</p>

			<p>
				For custom wrappers, you can pass <code>task.signal</code>, register a callback with
				<code>task.cleanup()</code>, or give a disposable resource to <code>task.own()</code>.
				Task-local <code>using</code> and <code>await using</code> declarations release resources
				when their lexical scope ends. Enable <code>ESNext.Disposable</code> in your TypeScript
				libraries when using this syntax. The compiler can supply the signal when a call's type
				exposes an optional
				<code>AbortSignal</code> or an options parameter with <code>signal?: AbortSignal</code>.
				Existing signals and event options are combined or extended, including Boolean capture flags
				on typed DOM event targets. The compiler uses the selected overload when deciding whether to
				supply a signal. Fetch cancellation remains connected while the response body is being read.
				A Request carries its cancellation signal unless you replace it with an explicit signal in
				the fetch options.
			</p>
			<p>
				When a custom async factory declares <code>@exact own</code> or <code>@exact cleanup</code>,
				awaiting it gives the resolved resource the task's lifetime. Its result must expose a
				recognized disposal method. An ordinary async factory can instead register its resource
				explicitly with <code>task.own()</code>.
			</p>
			<p>
				Automatic resource cleanup requires a local resource with a recognized cleanup method. Typed{' '}
				<code>Symbol.dispose</code> and <code>Symbol.asyncDispose</code> methods are recognized
				independently of the class name. Local aliases retain the resource's generation lifetime,
				including through strict identity comparisons and local helper results. Reading a member of
				a newly created resource retains task cleanup. Calling its disposal method directly closes
				it once. An optional disposal call keeps fallback cleanup if it does not run. Keep a
				discovered resource in a direct local binding. A compound object or array initializer
				produces an ownership diagnostic. A helper can create and register its disposable with the
				task context. Native timer clear and callback cancellation calls retain generation cleanup
				and callback fencing. Returning a closure that captures the resource does not transfer its
				ownership. Register cleanup with
				<code>task.cleanup()</code> rather than returning a cleanup function as task data. The
				compiler reports resources whose lifetime it cannot determine. Cleanup runs child-first and
				in reverse registration order within each task. When a resource offers both standard
				disposal methods, eXact selects <code>Symbol.asyncDispose</code> and awaits its result. It
				calls only that method, even if cleanup finishes synchronously. If the async member is
				absent or noncallable, it uses callable synchronous disposal. Explicit
				<code>task.own()</code> registration follows the same selection and returns the original
				object.
			</p>
			<p>
				A conditional disposal or cleanup registration releases ownership only when that path
				actually runs. Otherwise, generation cleanup still releases the resource. Unrelated methods
				do not replace its selected disposal policy. Register cleanup before the task producer
				returns or throws. Later registrations throw. Resources created inside a cleanup callback
				have native lifetime, and the compiler warns about that boundary. Dispose or cancel those
				resources in the callback or an ordinary helper.
			</p>
			<p>
				A helper recording cleanup may need the same cancellation signal it observed while work ran.
				Passing <code>task.signal</code> retains that relationship. Explicit signals follow the
				task's existing cancellation rules. Cleanup leaves absent signals and native event capture
				flags unchanged, and the compiler warns where a call would otherwise rely on implicit
				cancellation. An ordinary helper can own independent cleanup work and its lifetime.
			</p>
		</details>
	);
}
