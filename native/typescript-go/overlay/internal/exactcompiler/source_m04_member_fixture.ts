/** S08 source input. Foreign and browser alternatives remain independent. */
export function selectMember(flag: boolean, foreign: () => string) {
	const table = { run: flag ? () => document.title : foreign };
	return table.run();
}

/** Reading an accessor performs its body, but returning its callback does not invoke it. */
export function acquireMember() {
	const table = {
		get run() {
			window.name;
			return () => document.title;
		}
	};
	return table.run;
}

/** A reached Proxy Get contributes separately from the returned callable. */
export function proxyMember(invoke: boolean) {
	const table = new Proxy({ run: () => document.title }, {
		get(target, key, receiver) {
			window.name;
			return Reflect.get(target, key, receiver);
		}
	});
	const saved = table.run;
	return invoke ? saved() : '';
}

/** A saved Get retains its earlier donor through a later member write. */
export function savedMember() {
	const table = { run: () => document.title };
	const saved = table.run;
	table.run = () => 'quiet';
	return saved();
}

/** A new Get observes the replacement independently of the saved-Get control. */
export function currentMember() {
	const table = { run: () => document.title };
	table.run = () => 'quiet';
	return table.run();
}
