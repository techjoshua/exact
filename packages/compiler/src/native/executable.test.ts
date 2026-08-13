import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { nativeCompilerPlatformPackage, resolveNativeCompilerExecutable } from './executable.js';

describe('native compiler executable resolution', () => {
	it('uses platform-specific optional package names', () => {
		expect(nativeCompilerPlatformPackage('win32', 'x64')).toBe(
			'@exactjs/compiler-native-win32-x64'
		);
		expect(nativeCompilerPlatformPackage('linux', 'arm64')).toBe(
			'@exactjs/compiler-native-linux-arm64'
		);
	});

	it('resolves the platform compiler from an owning workspace', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-native-workspace-'));
		const packageName = nativeCompilerPlatformPackage();
		const filename = process.platform === 'win32' ? 'exactc-native.exe' : 'exactc-native';
		const packageRoot = path.join(root, 'node_modules', ...packageName.split('/'));
		const executable = path.join(packageRoot, filename);
		try {
			mkdirSync(packageRoot, { recursive: true });
			writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: packageName }));
			writeFileSync(executable, 'fixture');
			expect(resolveNativeCompilerExecutable(root)).toBe(executable);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
