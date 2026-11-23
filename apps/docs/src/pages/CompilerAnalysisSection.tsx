import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';

/** Explains dependency analysis, deferred work and current precision limits. */
export function CompilerAnalysisSection(this: Component<{}>) {
	return () => (
		<section>
			<h2>How dependencies guide compilation</h2>
			<p>
				The compiler uses TypeScript's syntax tree to preserve ordinary expressions, including
				nested calls and closures. It separately analyzes which values and operations depend on
				component state or require a particular environment. A runtime value does not have to be
				known during compilation. When eXact moves work into a task or continuation, its generated
				code preserves the expression's receiver, evaluation order and error behavior. Unresolved
				environment requirements can still prevent a client or server artifact from being emitted.
			</p>
			<p>
				Passing <code>document.title</code> to an imported function reads the browser value
				before the function runs. An initializer that performs this read and calls an
				unavailable implementation can only emit for the client. A getter passed in an object
				runs if the function reads that property.
			</p>
			<p>
				A helper can store an object through a local setter and return it to a component.
				If the component reads a getter on that stored object, the getter’s dependencies
				affect where the component can render. A getter that reads <code>document.title</code>
				requires the browser. Saving the field before calling the setter keeps the earlier object.
			</p>
			<p>
				When a task has no platform requirement or explicit placement, its analysis explains the
				scheduling default. Writing component state lets initial work run on the server. Without a
				state write, the default is the client. Data residency can further constrain that choice.
			</p>
			<p>
				Rendering and task execution have separate requirements. A component can render on the
				server while its event callbacks run in the browser and invoke server tasks through the
				framework's transport. Isomorphic rendering means that the component can render correctly on
				both targets. Compiler analysis records each target as supported, unsupported or unknown in{' '}
				<code>renderCapability</code>. Unknown means that support has not been proven. The current
				proof covers returned render functions with native HTML elements and covered setup and
				render effects. Child composition can remain unknown. The selected module and its
				initialization must also be legal for the requested artifact. These rendering facts do not
				grant hydration or server-operation authority. Analysis reports all components defined in the
				module you inspect. Known child components in other modules contribute placement through
				their render edges.
			</p>
			<p>
				A component can accept a callback and call it while producing its output. For a direct named
				props call in its returned render function, the compiler checks a supplied named function or
				inline callback at that particular composition edge. A browser requirement belongs to that
				use of the component. The shared component definition stays the same for other callers.
				Passing a callback to a component that never calls it does not execute its body. When the
				callable selection remains unresolved, analysis keeps the uncertainty and reports a warning
				while preserving the JavaScript. Callback props follow JSX source order. A final explicit
				prop selects its value after earlier spreads. A later unresolved spread keeps known possible
				callback requirements alongside uncertainty. Reading a spread property does not call the
				callback stored in it. Serialization requirements still apply when inputs cross a
				server/client boundary.
			</p>
			<p>
				Ordinary function receiver annotations retain their TypeScript meaning. When an annotation
				refers to the core <code>Component</code> contract, the compiler follows its declaration
				identity through renamed imports, type aliases and interface inheritance. A custom interface
				with a similar shape does not acquire component identity.
			</p>
			<p>
				Before rewriting an expression, the compiler captures its authored type constraints and
				evaluation requirements. Checking and executable lowering retain those constraints while
				preserving receiver selection, short-circuiting, suspension, and expression results.
				Component-owned render work completes native JSX lowering. Ordinary TSX helpers outside
				component definitions can retain host JSX that instantiates an already-compiled component.
			</p>
			<p>
				Import identity follows the declaration that a reference resolves to. A local callback that
				shares a renderer's name keeps its ordinary behavior, and type-only exports stay outside the
				runtime artifact. Module replacements retain optional call and member short-circuiting. JSX
				member tags resolve their values regardless of namespace capitalization. Diagnostics and
				source maps preserve authored locations across JavaScript line endings and Unicode text.
			</p>
			<p>
				A helper can return a server fallback when a browser global is unavailable. A
				<code>typeof window</code> check followed by an early return preserves that fallback.
				Creating an object with a getter or setter keeps its body deferred. Placement follows the
				reads and writes that invoke it, while computed property names execute during object
				creation. With <code>Object.create(null, {'{ score: { get value() { return document.title } } }'})</code>,
				the call reads the descriptor’s <code>value</code> immediately, so the creating task needs
				the browser even if it never reads <code>score</code>. A getter in a descriptor map runs when
				<code>Object.create</code> or <code>Object.defineProperties</code> reads its entry. With
				a single literal descriptor passed to <code>Object.create(null, …)</code> in a module
				initializer, a simple getter that reads a browser global while converting the descriptor puts components
				that use the resulting binding on the client. A callback stored as a data value runs
				when a component calls it through a single named read of the private binding. Reading a property on the
				object returned by <code>Object.defineProperty</code>
				also invokes its installed getter. If that getter reads <code>document</code>, the task
				that reads the property needs the browser. Standard <code>Object.assign(target, input)</code>
				returns the same target object. A getter installed on that result can also run when a
				component reads the property through the original target. An object created with
				<code>Object.create</code> can inherit a getter from its prototype. A single named read
				of a private module binding can invoke that getter, including when
				<code>Object.defineProperty</code> adds a different property to the created object.
				When an assignment invokes an
				authored setter, its parameter carries the assigned value's environment requirements into the
				setter's use of that value. When a setter on a local object stores the assigned object in
				another field, a later read can invoke a getter on the stored object. That getter’s
				requirements follow the read. A module binding initialized with
				<code>Object.defineProperty</code> can store a browser callback on a fresh object literal
				or on the direct result of <code>Object.create(null)</code>. A component that invokes
				the callback needs the browser.
				An ordinary descriptor can also compute its value with <code>get value()</code>.
				When that getter reads <code>document</code> during the module initializer, a component
				that uses the resulting binding renders in the browser.
				A descriptor getter for <code>enumerable</code> runs during the same conversion. A
				callback stored in a separate <code>value</code> field runs when the component invokes it.
				<code>Object.getOwnPropertyNames</code> collects names without running their getters.
				If a helper then uses <code>Reflect.get</code> to read those properties, its placement
				includes the getters that the reads can invoke, including nonenumerable ones.
				Freezing an ordinary object just created in that initializer keeps its stored callbacks
				and installed getters dormant. A computed property name can run a conversion method
				while the object is created. A getter on the descriptor map or on a descriptor field
				can also run during <code>Object.defineProperties</code>. If that eager work reads
				<code>document</code>, the initializer needs the browser.
				A descriptor value imported from another module also carries that module's initializer
				requirements. For example, if the imported value is initialized from
				<code>document.title</code>, a component that renders the frozen record needs the browser.
				An unresolved initializer is reported in the module where it runs.
				If a getter returns a
				method, calling that result also carries the method's own environment requirements. Reading
				the getter alone does not invoke the returned method. Portable built-in methods keep their
				declaration ownership through optional calls, and their callbacks retain their own
				environment requirements. For example, <code>Object.entries(input).map(pair =&gt; pair)</code>
				runs any getters it reads while enumerating <code>input</code>, so a getter that reads
				<code>document.title</code> makes the initializer browser-only. A component that renders the resulting module value
				needs the browser too, including when a helper returns the saved value. If the standard
				<code>Object.fromEntries</code> immediately consumes the mapped array, a callback can
				return a fresh pair such as
				<code>([key, value]) =&gt; [key, value]</code>. Computing either slot still contributes its own effects.
				A <code>for...of</code> loop over <code>Object.entries(input)</code> can also carry a
				yielded value to a later property read, including a value stored under a known computed
				key. If that read runs a browser getter, the component or task that performs it needs the browser.
				A loop over <code>['small', 'large'].entries()</code> can use its yielded indices
				in a read such as <code>table[index]</code>.
				A Promise executor runs during construction. A helper that reads <code>document</code> inside <code>new globalThis.Promise(...)</code> needs the
				browser even if the task discards the promise. Reading an object from a finite local
				container keeps that object's identity when the container slot is later replaced. Reads of
				the saved object still observe supported writes to its members. Unresolved calls and
				computed alternatives can remain unknown. A helper that installs a property keeps the object
				and value inputs from each call together, including getters that capture those inputs. Known
				environment dependencies remain visible when an unresolved target or key also leaves
				uncertainty. If placement depends on a property read or rest copy in a destructuring
				binding, the diagnostic can point to that binding in the helper.
			</p>
			<p>
				You can populate a private module-level <code>WeakMap</code> created with no
				constructor arguments using <code>map.set(key, value)</code>. When a component
				renders an entry with <code>map.get(key)</code>, JavaScript matches the key by
				identity. If evaluating the key or value for the write reads <code>document</code>,
				the server renders a client boundary for the component.
			</p>
			<p>
				Binding a function captures its receiver and leading arguments. Its body contributes to
				placement when the bound function is called, including when a helper returns it to a task.
				If you store <code>helper.bind(this)</code> in a setup constant and call it only from
				server tasks, eXact can keep a private server-only helper on the server. Client code can
				read the bound function’s <code>.length</code> when those reads and the server calls are
				its only uses and the helper’s descriptors remain unchanged. The server task can read
				current state and publish shared context updates.
				If code conditionally replaces a function’s <code>bind</code> method, both possible
				implementations contribute their placement requirements.
			</p>
			<p>
				A library can keep a registry in a global slot keyed by <code>Symbol.for</code>. Creating
				or deleting that symbol slot preserves named standard methods such as <code>Object.freeze</code>. A helper can
				also define properties on its own object or array literal without changing those methods.
				Freezing a fresh object after defining a Symbol-keyed data field preserves that field
				for a component to read. A getter on the same object runs when the component reads it.
				Reading a property descriptor leaves a stored callback dormant. If a helper uses
				<code>Object.getOwnPropertyDescriptor</code> on a local object, it can return the descriptor to its caller.
				Calling the descriptor's <code>value</code> includes the function held at lookup in placement.
				Calling <code>get</code> or <code>set</code> on a descriptor taken from a fresh object literal
				includes the corresponding accessor. A helper can
				replace that callback before lookup. A conditional replacement keeps both possible callbacks
				in consideration. For example, if either can read <code>document.title</code>, keep the
				invocation in a client task. Changing the target after lookup leaves the earlier descriptor
				intact.
			</p>
			<p>
				Placement includes work performed when a module loads, such as class static fields, static
				blocks and computed member names. A browser read in a static field still requires the
				browser. Instance field initializers and method bodies are considered when construction or
				invocation consumes them. A synchronous, locally declared class decorator whose only statement returns its class
				argument preserves that class for component tasks. Unresolved decorator application and disposal operations can
				retain unknown effects.
			</p>
			<p>
				An imported helper may capture a value created when its module loads. Calling that helper
				requires both the captured value and the work in its body to be available. A server-created
				value captured by a browser-reading helper prevents that eager call from being emitted for
				either target. Independent declarations can still be assigned to their own target, and a
				dormant function keeps its body deferred. When the compiler can prove that a private
				function cannot be called or exposed, it can rule out direct property assignments in
				that function when analyzing a separate read. Ordinary static imports can coexist with
				this proof. An exported wrapper or a callback that can call the private function
				still contributes its effects to placement, including during module initialization.
				Several declarations in one <code>const</code>
				statement keep their independent target placement. A single initializer expression that
				requires both environments remains a conflict. A <code>using</code> declaration releases its
				resources when its scope ends. Multiple resources in one list keep that shared cleanup
				requirement, which can remain unknown to placement analysis. Package export conditions
				select an implementation. The selected implementation still has its own environment
				requirements. A browser-only callback passed to a shared helper can restrict that call.
				Other callers keep their own placement. When you edit an imported child component, the
				compiler updates the affected render edges using the child’s new placement.
			</p>
			<p>
				A component can use a CommonJS dependency through a call such as
				<code>require('./labels.cjs')</code> when the bundler can include that module for the
				component’s target. Node built-ins such as <code>node:path</code> stay on the server.
				Passing the ambient loader around or supplying its module name dynamically also requires the
				server. A local function named <code>require</code> follows the same placement rules as any
				other authored function.
			</p>
			<p>
				For a small helper with no captured values, the compiler can connect a conditional field
				read to the arguments of that particular call. In this example the false branch returns zero
				without reading <code>input.value</code>.
			</p>
			<CodeBlock
				source={`export {};
const read = (take: boolean, input: { value: number }) =>
  take ? input.value : 0;
read(false, { value: 9 });`}
				language="ts"
				title="A selected field read"
			/>
			<p>
				This inference covers a boolean argument and an ordinary own data field in a qualified
				module prefix. Getters, Proxy receivers and unknown predicates keep their existing
				conservative analysis. It does not make an unresolved helper portable.
			</p>
			<p>
				A helper can return a function that reads an object supplied by its caller. Creating and
				storing the function leaves that read deferred. When the function is called, its environment
				requirement follows the captured object and the writes that can reach the property read.
			</p>
			<CodeBlock
				source={`function make(input: { value: string }) {
  return () => input.value;
}
const input = { value: 'safe' };
const readers = [make(input)];
input.value = document.title;
export const value = readers[0]!();`}
				language="ts"
				title="A captured read through a container"
			/>
			<p>
				Here the exported value depends on the browser because the captured read observes the
				assignment from <code>document.title</code>. The compiler does not need to know the title
				string. Replacing that assignment with an ordinary string removes this browser dependency. A
				later write to an unrelated property does not affect the read. Unknown overlapping writes,
				getters and Proxy behavior retain their own effects and uncertainty. Retaining a Proxy
				handler&apos;s known effects does not make an unresolved Proxy construction portable, and
				that construction can still prevent emission.
			</p>
			<p>
				Saving a method in a local variable keeps the function selected by that read. Replacing its
				original receiver later does not change the saved function. Calling the saved variable
				follows ordinary JavaScript rules for <code>this</code>. Possible foreign values retain
				uncertainty alongside any known browser or server requirements. Getter effects and returned
				values are tracked separately. If a getter returns a known defined value, an unresolved
				effect during its evaluation does not activate a caller default. The unresolved effect still
				contributes to placement.
			</p>
			<p>
				A small helper can also use a numeric literal as its only parameter default. For
				<code>{'const read = (x: number = 7) => x'}</code>, a known numeric argument bypasses the
				initializer, while an omitted argument or <code>undefined</code> selects seven. This precise
				inference covers a helper with no captured values that directly returns that parameter. The
				same inference supports <code>{'(x: number = 7, y: number = x) => y'}</code>. With no
				arguments it initializes x to seven, then reads that x for y. A supplied y bypasses its
				default. General parameter-default expressions, effectful or throwing defaults and unknown
				arguments keep conservative analysis.
			</p>
			<p>
				The compiler also tracks a default that reads an earlier required object parameter:
				<code>{'(input: { value: number }, x: number = input.value) => x'}</code>. Passing{' '}
				<code>{'{ value: 7 }'}</code> alone, or with <code>undefined</code>, selects seven.
				Supplying five as the second argument bypasses that property read. The compiler uses the
				current own data property, including a write made before the call. This precise inference
				does not extend to getters, inherited properties, Proxy receivers or unknown values.
			</p>
			<p>
				For an own data field that can be null or undefined, the helper can select a numeric
				fallback with{' '}
				<code>
					{'(input: { value: number | null | undefined }, x: number = input.value ?? 7) => x'}
				</code>
				. The property is read once. An explicit null or undefined field selects seven, while
				numeric zero stays zero. A supplied numeric second argument bypasses the complete
				initializer. This inference covers a present own field and the literal fallback shown.
				Missing or inherited fields, getters, Proxy receivers and more general initializers retain
				conservative analysis.
			</p>
			<p>
				The compiler also tracks the failure in the deliberately unsafe default
				<code>{'(x: number = (null as any).value) => x'}</code>. Omitting the argument or passing
				<code>undefined</code> selects a TypeError before the parameter is initialized or the body
				runs. A supplied known number bypasses that access. The assertion permits the example to
				type-check and supplies no runtime safety evidence. Analysis of exception-object properties
				and more general throwing defaults remains outside this bounded inference.
			</p>
			<p>
				A small helper can report an acquired argument&apos;s JavaScript type with
				<code>{'(value: unknown) => typeof value'}</code>. The compiler tracks the usual result for
				the supported number, boolean, string, undefined, null, object and callable arguments
				described here. Evaluating the operand preserves its writes and errors. Inspecting an object
				or function value this way reads no properties and invokes no callback. BigInt, Symbol and
				unresolved native-library values keep their existing conservative analysis. This bounded
				inference adds no handling for unbound identifiers or temporal-dead-zone reads.
			</p>
			<p>
				Functions can also carry ordinary properties. Reading a function property or assigning a
				callback keeps that callback deferred. Calling it contributes its browser or server
				requirements, including its receiver and default arguments. A saved callback keeps the value
				selected before later argument evaluation replaces the property. If a method getter or an
				earlier argument changes a local callback, a later argument reads the new callback.
				Calling it can install a getter whose browser requirements apply when the task reads it.
				Passing a function to <code>Array.isArray</code> leaves its body deferred. In
				<code>Array.isArray(input.value)</code>, the getter for <code>value</code> still runs and
				can invoke the function itself.
			</p>
			<p>
				When a helper is defined in the compiled source, ordinary direct calls,
				<code>call</code> and <code>apply</code> retain its known environment requirements, receiver
				and arguments. The caller also contributes any actual getter, replacement method or other
				unresolved work. A published component is analyzed within its source and supported package
				contracts, without inspecting arbitrary future applications. A public framework operation
				such as DOM <code>render</code> retains its browser requirement when a build adapter
				resolves its package boundary, even when the implementation stays external. A compatible
				function type alone does not make an external callable portable.
			</p>
			<p>
				Applications can install conforming polyfills for the built-ins described by the target's
				standard libraries. The compiler trusts those contracts without inspecting each polyfill
				implementation. Published libraries keep the same contract when their consumers select a
				different implementation. A shadow constructor with the same name keeps its authored
				behavior. Browser globals such as <code>document</code> still require a browser. For
				example,
				<code>[3, 4, 6, 8].includes(value.length)</code> can run on either target when
				<code>value</code> is a string. Reading <code>document.title.length</code> as its search
				argument requires the browser. An object supplied as the starting index can also run
				authored code when JavaScript converts it to a number.
			</p>
			<p>
				In <code>[record.count, 2].every(Number.isFinite)</code>, the predicate checks each value
				without coercion. A getter on <code>record.count</code> still contributes its own
				environment requirements. An authored predicate, including a locally defined
				<code>Number.isFinite</code>, contributes the requirements of the code it runs. A later
				property read can also require the browser. For example, if a task pushes a record into a
				fresh local array, selects the first record, and reads a getter that uses
				<code>document</code>, that read requires client execution.
			</p>
			<p>
				When an asynchronous helper stores a standard Promise's resolver for later use, the compiler
				retains that callable's contract through ordinary aliases and assignments. The executor and
				call arguments keep their own effects. Resolving an object can invoke its <code>then</code>
				getter and body, so those requirements also contribute to placement. Rejecting an object
				does not inspect its <code>then</code> property. Neither operation is treated as pure.
			</p>
			<p>
				Awaiting a value can also run its <code>then</code> getter and method. When an awaited
				expression can select a known thenable or an unresolved value, the known thenable's
				environment requirements still constrain task placement. A browser-reading method therefore
				prevents server placement even when another alternative remains unknown. The compiler does
				not need to know the fulfilled value to retain that requirement.
			</p>
		</section>
	);
}
