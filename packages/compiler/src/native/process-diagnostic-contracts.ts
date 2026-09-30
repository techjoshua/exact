/** Stable diagnostic returned by the native eXact compiler process. */
export type NativeCompilerDiagnostic = Readonly<{
	severity: 'info' | 'warning' | 'error';
	code: string;
	message: string;
	filename?: string;
	/** UTF-16 offsets into the authored source. */
	start?: number;
	line?: number;
	column?: number;
	length?: number;
	/** Causal operations can belong to imported source files. */
	related?: readonly Readonly<{
		filename: string;
		start: number;
		length: number;
		line: number;
		column: number;
		message: string;
	}>[];
	fixStart?: number;
	fixText?: string;
}>;
