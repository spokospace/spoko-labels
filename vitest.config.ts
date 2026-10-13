import { fileURLToPath } from "node:url";
import ts from "typescript";
import { defineConfig } from "vitest/config";

// Tests import workspace packages from their sources, so `pnpm test` works before `pnpm build`. The
// mapping is the `paths` of tsconfig.base.json, the single list of workspace packages.
const basePath = fileURLToPath(new URL("./tsconfig.base.json", import.meta.url));
const { config, error } = ts.readConfigFile(basePath, ts.sys.readFile);
if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
const paths: Record<string, string[]> = config.compilerOptions.paths;

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      Object.entries(paths).map(([name, [target]]) => [name, fileURLToPath(new URL(target as string, import.meta.url))]),
    ),
  },
});
