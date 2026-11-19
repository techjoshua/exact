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
				Rendering and task execution have separate requirements. A component can render on the
				server while its event callbacks run in the browser and invoke server tasks through the
				framework's transport. Isomorphic rendering means that the component can render correctly on
				both targets. Compiler analysis records each target as supported, unsupported or unknown in{' '}
				<code>renderCapability</code>. Unknown means that support has not been proven. The current
				proof covers returned render functions with native HTML elements and covered setup and
				render effects. Child composition can remain unknown. The selected module and its
				initialization must also be legal for the requested artifact. These rendering facts do not
				grant hydration or server-operation authority.
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
				creation. When an assignment invokes an authored setter, its parameter carries the assigned
				value's environment requirements into the setter's use of that value. If a getter returns a
				method, calling that result also carries the method's own environment requirements. Reading
				the getter alone does not invoke the returned method. Portable built-in methods keep their
				declaration ownership through optional calls, and their callbacks retain their own
				environment requirements. Reading an object from a finite local container keeps that
				object's identity when the container slot is later replaced. Reads of the saved object still
				observe supported writes to its members. Unresolved calls and computed alternatives can
				remain unknown. A helper that installs a property keeps the object and value inputs from
				each call together, including getters that capture those inputs. Known environment
				dependencies remain visible when an unresolved target or key also leaves uncertainty.
			</p>
			<p>
				Placement includes work performed when a module loads, such as class static fields, static
				blocks and computed member names. A browser read in a static field still requires the
				browser. Instance field initializers and method bodies are considered when construction or
				invocation consumes them. Unresolved decorator application and disposal operations can
				retain unknown effects.
			</p>
			<p>
				An imported helper may capture a value created when its module loads. Calling that helper
				requires both the captured value and the work in its body to be available. A server-created
				value captured by a browser-reading helper prevents that eager call from being emitted for
				either target. Independent declarations can still be assigned to their own target, and a
				dormant function keeps its body deferred. Several declarations in one <code>const</code>
				statement keep their independent target placement. A single initializer expression that
				requires both environments remains a conflict. A <code>using</code> declaration releases its
				resources when its scope ends. Multiple resources in one list keep that shared cleanup
				requirement, which can remain unknown to placement analysis. Package export conditions
				select an implementation. The selected implementation still has its own environment
				requirements.
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
				selected before later argument evaluation replaces the property.
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
				behavior. Browser globals such as <code>document</code> still require a browser.
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
