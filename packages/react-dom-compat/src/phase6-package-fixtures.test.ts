import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "@exact/react-compat";
import { renderToString } from "./server-node.js";

let Airplay: any;
let ThemeProvider: any;
let useTheme: any;
let QueryClient: any;
let QueryClientProvider: any;
let useQuery: any;
let ErrorBoundary: any;

beforeAll(async () => {
  ({ Airplay } = await import("../fixtures/phase2.mjs"));
  ({ ThemeProvider, useTheme, QueryClient, QueryClientProvider, useQuery } = await import("../fixtures/phase3.mjs"));
  ({ ErrorBoundary } = await import("../fixtures/phase4.mjs"));
});

describe("React compatibility Phase 6 published-package certification", () => {
  it("server-renders a current lucide icon with normalized SVG attributes", () => {
    const html = renderToString(createElement(Airplay, { size: 16, strokeWidth: 1.5, "aria-label": "airplay" }));
    expect(html).toContain("<svg");
    expect(html).toContain('stroke-width="1.5"');
    expect(html).toContain('aria-label="airplay"');
  });

  it("composes Emotion, TanStack Query, and react-error-boundary during SSR", () => {
    const client = new QueryClient();
    client.setQueryData(["phase6"], "certified");
    function PackageTree() {
      const theme = useTheme();
      const query = useQuery({ queryKey: ["phase6"], queryFn: () => Promise.resolve("unused") });
      return createElement("strong", { style: { color: theme.color } }, query.data);
    }
    const tree = createElement(ErrorBoundary, { fallback: createElement("i", null, "failed") },
      createElement(ThemeProvider, { theme: { color: "navy" } },
        createElement(QueryClientProvider, { client }, createElement(PackageTree))
      )
    );
    expect(renderToString(tree)).toContain('<strong style="color:navy">certified</strong>');
  });
});
