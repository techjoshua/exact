/** Stable diagnostic returned by the native eXact compiler process. */
export type NativeCompilerDiagnostic = Readonly<{
	severity: 'info' | 'warning' | 'error';
	code: string;
	message: string;
	filename?: string;
	start?: number;
	length?: number;
}>;
