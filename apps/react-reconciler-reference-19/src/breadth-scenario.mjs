import { PassThrough } from "node:stream";
import React, { createElement, useEffect, useState } from "react";
import { Box, Text as InkText, render as renderInk } from "ink";
import { Document, Page, Text as PdfText, View, renderToBuffer } from "@react-pdf/renderer";

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Runs breadth scenario with the supplied execution context. */
export async function runBreadthScenario() {
  const inkOutput = new PassThrough();
  inkOutput.columns = 80;
  inkOutput.rows = 24;
  inkOutput.isTTY = false;
  let terminal = "";
  inkOutput.on("data", chunk => { terminal += chunk.toString(); });
  const effects = [];
  let update;
  function InkApp() {
    const [count, setCount] = useState(0);
    update = setCount;
    useEffect(() => { effects.push(`mount:${count}`); return () => effects.push(`cleanup:${count}`); }, [count]);
    return createElement(Box, null, createElement(InkText, { color: "green" }, `Ink count ${count}`));
  }
  const ink = renderInk(createElement(InkApp), {
    stdout: inkOutput,
    stderr: inkOutput,
    debug: true,
    interactive: false,
    exitOnCtrlC: false,
    patchConsole: false
  });
  await ink.waitUntilRenderFlush();
  update(value => value + 1);
  await delay(50);
  await ink.waitUntilRenderFlush();
  ink.unmount();
  await ink.waitUntilExit();
  await delay(0);

  function PdfDocument() {
    const [label] = useState("React PDF compatibility");
    return createElement(Document, null,
      createElement(Page, { size: "A4" },
        createElement(View, null, createElement(PdfText, null, label))
      )
    );
  }
  const pdf = await renderToBuffer(createElement(PdfDocument));
  return {
    ink: {
      renderedInitial: terminal.includes("Ink count 0"),
      renderedUpdate: terminal.includes("Ink count 1"),
      effects,
      bytes: Buffer.byteLength(terminal)
    },
    reactPdf: {
      header: pdf.subarray(0, 4).toString("ascii"),
      bytes: pdf.length
    }
  };
}
