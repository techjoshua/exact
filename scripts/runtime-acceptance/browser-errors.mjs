/** Retains browser faults and consumes only exact console error identities verified by owned journeys. */
export function collectBrowserErrors(page) {
	const errors = [];
	const consoleErrors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message);
	});
	return {
		errors,
		/** Releases isolated realms after their console identities have been checked. */
		async releaseFrames() {
			await page.evaluate(() => {
				for (const frame of window.exactAcceptanceFrames ?? []) frame.remove();
				window.exactAcceptanceFrames = [];
			});
		},
		async flush() {
			for (const message of consoleErrors.splice(0)) {
				const error = message.args()[1];
				const expected =
					error &&
					(await error
						.evaluate((value) => {
							const queue = window.parent.exactExpectedConsoleErrors;
							const index = queue?.indexOf(value) ?? -1;
							if (index < 0) return false;
							queue.splice(index, 1);
							return true;
						})
						.catch(() => false));
				if (!expected) errors.push(message.text());
			}
		}
	};
}

/** Preserves public root reporters and retains their errors for validation by the enclosing journey. */
export function observedRootFactorySource() {
	return `window.exactExpectedConsoleErrors=[];
function observedRoot(create,optionsIndex=1){return(...args)=>{
 const options=args[optionsIndex]??{};
 const report=options.onUncaughtError;
 args[optionsIndex]={...options,onUncaughtError(error,info){
  report?.call(options,error,info);
  if(report) window.parent.exactExpectedConsoleErrors.push(error);
 }};
 return create(...args);
};}`;
}
