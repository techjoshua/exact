import { onTestFinished } from 'vitest';
import { createLibraryBuildFilesFixture } from './library-build-files.fixture.js';

/** Creates an owned library checkout and removes it after the requesting test. */
export function createLibraryBuildFixture() {
	return createLibraryBuildFilesFixture(onTestFinished);
}
