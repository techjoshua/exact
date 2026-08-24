import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeCompilerPlatformPackage, resolveNativeCompilerExecutable } from './executable.js';

describe('native compiler executable resolution', () => {
	beforeEach(() => {
		vi.stubEnv('EXACT_COMPILER_EXECUTABLE', '');
		vi.stubEnv('EXACT_NATIVE_COMPILER', '');
	});
	afterEach(() => vi.unstubAllEnvs());

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
		const filename = process.platform === 'win32' ? 'exactc.exe' : 'exactc';
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

	it('prefers the current executable override over the legacy override', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-compiler-override-'));
		const current = path.join(root, 'exactc');
		const legacy = path.join(root, 'legacy-exactc');
		try {
			writeFileSync(current, 'current');
			writeFileSync(legacy, 'legacy');
			vi.stubEnv('EXACT_COMPILER_EXECUTABLE', current);
			vi.stubEnv('EXACT_NATIVE_COMPILER', legacy);
			expect(resolveNativeCompilerExecutable()).toBe(current);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('accepts the legacy executable override during migration', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-compiler-legacy-'));
		const executable = path.join(root, 'exactc');
		try {
			writeFileSync(executable, 'legacy');
			vi.stubEnv('EXACT_NATIVE_COMPILER', executable);
			expect(resolveNativeCompilerExecutable()).toBe(executable);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
