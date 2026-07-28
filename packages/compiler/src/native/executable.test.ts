import { describe, expect, it } from 'vitest';
import { nativeCompilerPlatformPackage } from './executable.js';

describe('native compiler executable resolution', () => {
	it('uses platform-specific optional package names', () => {
		expect(nativeCompilerPlatformPackage('win32', 'x64')).toBe(
			'@exactjs/compiler-native-win32-x64'
		);
		expect(nativeCompilerPlatformPackage('linux', 'arm64')).toBe(
			'@exactjs/compiler-native-linux-arm64'
		);
	});
});
