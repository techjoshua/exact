import { createConsoleLogger } from "@exact/core";
import { render } from "@exact/dom";
import { AppBoundary } from "./components/AppBoundary.jsx";
import { Workbench } from "./components/Workbench.jsx";
import "./styles.css";

const logger = createConsoleLogger({ level: "debug" });

render(
  <AppBoundary logger={logger}>
    <Workbench logger={logger} />
  </AppBoundary>,
  document.getElementById("app")!,
  { logger }
);
