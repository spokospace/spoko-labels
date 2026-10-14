// Deploys apps/web/dist to Cloudflare Pages, by hand, from the maintainer's machine (nothing runs in CI).
// Refuses unless the checkout is exactly the merged code: a clean tree whose HEAD is origin/main, built from
// that commit. Run the validation gate (which builds dist/) first; see the README.
//
//   pnpm --filter @spokospace/labels-web run deploy:pages
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Pinned; run through `pnpm dlx`, so nothing is installed in the workspace. */
export const WRANGLER = "wrangler@4.151.0";
export const PROJECT = "spoko-labels";

const appDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * Checks that dist/ may be deployed. `git` runs one git command and returns its output; `readIndex` returns
 * dist/index.html, or null when there is none. Returns the reason to refuse, or null when all is well.
 */
export function refusal({ git, readIndex }) {
  git(["fetch", "origin", "main"]);
  if (git(["status", "--porcelain"]).trim() !== "") {
    return "The working tree has uncommitted or untracked files. Deploy only merged code: commit or remove them first.";
  }
  const head = git(["rev-parse", "HEAD"]).trim();
  const main = git(["rev-parse", "origin/main"]).trim();
  if (head !== main) {
    return `HEAD (${head.slice(0, 7)}) is not origin/main (${main.slice(0, 7)}). Check out origin/main and build it before deploying.`;
  }
  const index = readIndex();
  if (index === null) return "There is no dist/index.html. Run `pnpm build` first.";
  // The build writes the full commit it was built from into index.html (see vite.config.ts).
  const built = /<meta name="spoko-labels-commit" content="([^"]*)"/.exec(index)?.[1];
  if (built !== head) return `dist/ was not built from ${head.slice(0, 7)}. Run \`pnpm build\` again.`;
  return null;
}

/** Runs the checks, then wrangler. Returns the process exit code. */
export function deploy({ git, readIndex, run, log }) {
  const reason = refusal({ git, readIndex });
  if (reason) {
    log(`deploy:pages refused: ${reason}`);
    return 1;
  }
  run("pnpm", ["dlx", WRANGLER, "pages", "deploy", "dist", "--project-name", PROJECT, "--branch", "main"]);
  log("Deployed. Check that the footer of the live page shows the commit of origin/main.");
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const indexPath = join(appDir, "dist", "index.html");
  process.exitCode = deploy({
    git: (args) => execFileSync("git", args, { cwd: appDir, encoding: "utf8" }),
    readIndex: () => (existsSync(indexPath) ? readFileSync(indexPath, "utf8") : null),
    // shell: pnpm is a .cmd file on Windows.
    run: (command, args) => execFileSync(command, args, { cwd: appDir, stdio: "inherit", shell: process.platform === "win32" }),
    log: (message) => console.log(message),
  });
}
