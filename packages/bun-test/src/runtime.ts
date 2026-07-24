import { plugin } from 'bun';
import { expect } from 'bun:test';
import { exact, type ExactBunPluginOptions } from '@exactjs/bun-plugin';
import { installExactMatchers } from '@exactjs/testing';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

/** Configures eXact's Bun test preload behavior. */
export type ExactBunTestConfiguration = {
	/** Registers Happy DOM globals. Defaults to true when no document exists. */
	dom?: boolean;
	/** Registers the eXact runtime compiler plugin, or disables it with false. */
	compiler?: false | ExactBunPluginOptions;
	/** Installs the shared eXact matchers. Defaults to true. */
	matchers?: boolean;
};

let domInstalled = false;
let compilerInstalled = false;
let matchersInstalled = false;

/** Configures eXact for the current Bun test process. */
export function configureExactBunTest(configuration: ExactBunTestConfiguration = {}): void {
	if (configuration.dom !== false && typeof document === 'undefined' && !domInstalled) {
		GlobalRegistrator.register();
		domInstalled = true;
	}
	if (configuration.compiler !== false && !compilerInstalled) {
		plugin(exact(configuration.compiler ?? {}));
		compilerInstalled = true;
	}
	if (configuration.matchers !== false && !matchersInstalled) {
		installExactMatchers(expect);
		matchersInstalled = true;
	}
}
