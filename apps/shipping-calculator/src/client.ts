import { createExactClient, hydrateClientIslands, readExactHydrationConfig } from "@exact/hydrate";
import { exactClientIslands } from "../.exact/client-registry.js";
import { installExactClient } from "./client-runtime.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("Parcel Lab root was not found");
const config = readExactHydrationConfig(root);
const client = createExactClient(root, { ...config, islands: exactClientIslands, batch: true, stream: true });
installExactClient(client);
hydrateClientIslands(root, exactClientIslands, { ...config, stream: true });
