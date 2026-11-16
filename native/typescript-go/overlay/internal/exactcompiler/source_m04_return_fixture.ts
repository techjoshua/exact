type Receiver = { prefix: string };
type Operation = (this: Receiver, suffix: string) => string;

/** S10 factory exposure associates captures with this creating Call and return. */
export function factory(callback: () => string): Operation {
	return function (this: Receiver, suffix: string) {
		return this.prefix + callback() + suffix;
	};
}

/** Library definition remains relative across quiet and browser application actuals. */
export function application(): string {
	const quiet = factory(() => 'quiet');
	const browser = factory(() => document.title);
	return quiet.call({ prefix: 'a' }, 'b') + browser.call({ prefix: 'c' }, 'd');
}

/** Saving one factory result must not borrow the capture of a later creating Call. */
export function savedFactory(): string {
	const saved = factory(() => document.title);
	factory(() => 'quiet');
	return saved.call({ prefix: 'saved' }, '!');
}

/** Constructing and returning a callable does not activate its captured callback. */
export function dormantFactory(): Operation {
	return factory(() => document.title);
}

/** Conditional known donors survive the independent foreign-call residual. */
export function conditionalFactory(flag: boolean, foreign: () => string): string {
	const saved = factory(flag ? () => document.title : foreign);
	return saved.call({ prefix: '' }, '');
}

/** A completed finally write belongs to the returned closure's live capture. */
export function finallyFactory(): () => string {
	let callback = () => 'quiet';
	try { return () => callback(); }
	finally { callback = () => document.title; }
}

/** Connected S08-S10 route invokes only after descriptor storage and inherited Get. */
export function inheritedFactory(flag: boolean, foreign: () => string): string {
	const execute = factory(flag ? () => document.title : foreign);
	const prototype = Object.freeze(Object.defineProperties({}, { run: { value: execute } }));
	const target: Receiver & { run: Operation } = Object.create(prototype);
	Object.defineProperty(target, 'prefix', { value: 'inherited' });
	return target.run('!');
}
