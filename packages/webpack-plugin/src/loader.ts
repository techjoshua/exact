import { transformExactWebpackSourceAsync, type ExactWebpackPluginOptions } from "./index.js";

type LoaderContext = {
  resourcePath?: string;
  query?: unknown;
  getOptions?(): ExactWebpackPluginOptions;
  callback(error: Error | null, code?: string, map?: unknown): void;
};

export default async function exactWebpackLoader(this: LoaderContext, source: string): Promise<void> {
  try {
    const result = await transformExactWebpackSourceAsync(source, this.resourcePath ?? "input.tsx", this.getOptions?.() ?? {});
    this.callback(null, result?.code ?? source, result?.map ?? null);
  } catch (error) {
    this.callback(error instanceof Error ? error : new Error(String(error)));
  }
}
