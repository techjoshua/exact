import { transformExactWebpackSource, type ExactWebpackPluginOptions } from "./index.js";

type LoaderContext = {
  resourcePath?: string;
  query?: unknown;
  getOptions?(): ExactWebpackPluginOptions;
  callback(error: Error | null, code?: string, map?: unknown): void;
};

export default function exactWebpackLoader(this: LoaderContext, source: string): void {
  try {
    const result = transformExactWebpackSource(source, this.resourcePath ?? "input.tsx", this.getOptions?.() ?? {});
    this.callback(null, result?.code ?? source, result?.map ?? null);
  } catch (error) {
    this.callback(error instanceof Error ? error : new Error(String(error)));
  }
}
