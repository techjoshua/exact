import { createConsoleLogger } from "@exact/core";
import { render } from "@exact/dom";
import { Board } from "./components/Board.jsx";
import "./styles.css";

const logger = createConsoleLogger({ level: "debug" });

render(<Board logger={logger} />, document.getElementById("app")!, { logger });
