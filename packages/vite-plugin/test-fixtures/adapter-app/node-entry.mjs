import React from "react";

if (!React.version.endsWith("-exact")) {
  throw new Error(`Expected eXact React compatibility runtime, received ${React.version}`);
}
