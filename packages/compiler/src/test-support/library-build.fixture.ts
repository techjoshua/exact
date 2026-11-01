import { onTestFinished } from 'vitest';
import { createLibraryBuildFilesFixture } from './library-build-files.fixture.js';

/** Creates an owned library checkout, optionally beside other same-filesystem fixtures. */
export function createLibraryBuildFixture(parent?: string) {
	return createLibraryBuildFilesFixture(onTestFinished, parent);
}
