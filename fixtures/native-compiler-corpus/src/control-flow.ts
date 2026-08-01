declare function cleanup(value?: number): void;
declare function recover(error?: unknown): void;
declare function work(): number;

export function choose(value: number): number {
	if (value > 0) return 1;
	value++;
	return value;
}

export function switchAndFinalize(value: number): number {
	while (value--) {
		if (value === 2) continue;
		if (value === 1) break;
	}
	switch (value) {
		case 0:
			value++;
		case 1:
			value++;
			break;
		default:
			return value;
	}
	try {
		return value;
	} finally {
		cleanup(value);
	}
}

export function labeledFinally(values: readonly number[]): number {
	outer: for (const value of values) {
		try {
			if (value < 0) continue outer;
			if (value === 0) break outer;
		} finally {
			cleanup(value);
		}
	}
	return 1;
}

export function conditionalFinally(override: boolean): number {
	try {
		return work();
	} catch (error) {
		recover(error);
		return 0;
	} finally {
		if (override) return 2;
		cleanup();
	}
}
