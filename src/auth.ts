import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { EOL } from "node:os";
import { resolve } from "node:path";
import { debug, exportVariable } from "@actions/core";

/**
 * Configure npm registry authentication by writing a .npmrc file.
 * Ported from actions/setup-node's authutil.ts.
 */
export function configAuthentication(registryUrl: string, scope?: string): void {
  const npmrc = resolve(process.env.RUNNER_TEMP || process.cwd(), ".npmrc");

  if (!registryUrl.endsWith("/")) {
    registryUrl += "/";
  }

  writeRegistryToFile(registryUrl, npmrc, scope);
}

function writeRegistryToFile(registryUrl: string, fileLocation: string, scope?: string): void {
  // Auto-detect scope for GitHub Packages registry
  if (!scope && registryUrl.includes("npm.pkg.github.com")) {
    scope = process.env.GITHUB_REPOSITORY_OWNER;
  }

  if (scope && !scope.startsWith("@")) {
    scope = "@" + scope;
  }

  if (scope) {
    scope = scope.toLowerCase() + ":";
  } else {
    scope = "";
  }

  debug(`Setting auth in ${fileLocation}`);

  let newContents = "";
  if (existsSync(fileLocation)) {
    const curContents = readFileSync(fileLocation, "utf8");
    for (const line of curContents.split(EOL)) {
      // Preserve lines that don't set the scoped registry
      if (!line.toLowerCase().startsWith(`${scope}registry`)) {
        newContents += line + EOL;
      }
    }
  }

  // Auth token line: remove protocol prefix from registry URL
  const authString = registryUrl.replace(/^\w+:/, "") + ":_authToken=${NODE_AUTH_TOKEN}";
  const registryString = `${scope}registry=${registryUrl}`;
  newContents += `${authString}${EOL}${registryString}`;

  writeFileSync(fileLocation, newContents);

  exportVariable("NPM_CONFIG_USERCONFIG", fileLocation);
  // Export placeholder if NODE_AUTH_TOKEN is not set so npm doesn't error
  exportVariable("NODE_AUTH_TOKEN", process.env.NODE_AUTH_TOKEN || "XXXXX-XXXXX-XXXXX-XXXXX");
}
