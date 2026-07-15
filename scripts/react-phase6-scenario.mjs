import { PassThrough } from "node:stream";

/** Collects stable production-hardening observations for Phase 6. */
export async function collectReactPhase6Trace({ React, ReactDOM, ReactDOMServer, baseline }) {
  const originalError = console.error;
  console.error = () => {};
  try {
    const hostCases = generatedHostCases(React).map(tree => ReactDOMServer.renderToString(tree));
    const identifiers = ReactDOMServer.renderToString(React.createElement(IdentifierPair), { identifierPrefix: "cert-" });
    const ids = [...identifiers.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
    const bootstrap = await pipeableText(
      ReactDOMServer,
      React.createElement("main", null, "boot"),
      { bootstrapScriptContent: "self.__boot=1", bootstrapScripts: ["/app.js"], nonce: "phase6" }
    );
    const resourceHints = baseline.startsWith("19") && typeof ReactDOM?.preload === "function"
      ? ReactDOMServer.renderToString(React.createElement(ResourceTree))
      : "unsupported";
    return {
      baseline,
      hostCases,
      identifiers: { count: ids.length, unique: new Set(ids).size, prefixed: ids.every(id => id.includes("cert-")) },
      bootstrap,
      resourceHints
    };

    function IdentifierPair() {
      const first = React.useId();
      const second = React.useId();
      return React.createElement("div", null,
        React.createElement("span", { id: first }),
        React.createElement("span", { id: second })
      );
    }

    function ResourceTree() {
      ReactDOM.prefetchDNS("https://dns.example.test");
      ReactDOM.preconnect("https://cdn.example.test", { crossOrigin: "anonymous" });
      ReactDOM.preload("/phase6.woff2", { as: "font", crossOrigin: "", type: "font/woff2" });
      ReactDOM.preinit("/phase6.css", { as: "style", precedence: "high", crossOrigin: "" });
      ReactDOM.preinit("/phase6.js", { as: "script", nonce: "phase6" });
      ReactDOM.preinitModule("/phase6-entry.js", { nonce: "module" });
      ReactDOM.preloadModule("/phase6-module.js");
      return React.createElement("article", null, "resources");
    }
  } finally {
    console.error = originalError;
  }
}

function generatedHostCases(React) {
  const cases = [];
  for (const disabled of [false, true]) {
    for (const checked of [false, true]) {
      cases.push(React.createElement("input", {
        name: "choice", disabled, defaultChecked: checked, defaultValue: checked ? "yes" : "no"
      }));
    }
  }
  cases.push(
    React.createElement("select", { defaultValue: "b" },
      React.createElement("option", { value: "a" }, "A"),
      React.createElement("option", { value: "b" }, "B")
    ),
    React.createElement("textarea", { defaultValue: "<safe>" }),
    React.createElement("svg", { viewBox: "0 0 4 4", strokeWidth: 2 }, React.createElement("path", { d: "M0 0h4" })),
    React.createElement("div", { style: { marginTop: 4, lineHeight: 2, WebkitLineClamp: 2, msTransition: "all" } }),
    React.createElement("x-phase6", { class: "custom", enabled: true, count: 2 }),
    React.createElement("img", { src: "/hero.png", width: 10, height: 10 })
  );
  return cases;
}

async function pipeableText(server, tree, options) {
  const destination = new PassThrough();
  let html = "";
  destination.setEncoding("utf8");
  destination.on("data", chunk => { html += chunk; });
  const ended = new Promise((resolve, reject) => destination.on("end", resolve).on("error", reject));
  server.renderToPipeableStream(tree, options).pipe(destination);
  await ended;
  return html;
}
