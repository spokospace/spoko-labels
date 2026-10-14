import { describe, expect, it } from "vitest";
import { deploy, PROJECT, refusal, WRANGLER } from "../scripts/deploy.mjs";

const MAIN = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const OTHER = "ffffffffffffffffffffffffffffffffffffffff";

/** A stubbed git: answers the commands the script runs, and records them. */
function fakeGit({ status = "", head = MAIN, main = MAIN } = {}) {
  const calls: string[] = [];
  const git = (args: string[]) => {
    calls.push(args.join(" "));
    switch (args.join(" ")) {
      case "fetch origin main":
        return "";
      case "status --porcelain":
        return status;
      case "rev-parse HEAD":
        return `${head}\n`;
      case "rev-parse origin/main":
        return `${main}\n`;
      default:
        throw new Error(`unexpected git ${args.join(" ")}`);
    }
  };
  return { git, calls };
}

const builtIndex = (sha = MAIN) => () =>
  `<meta name="spoko-labels-commit" content="${sha}">\n<footer>Version <span id="version">${sha.slice(0, 7)} 2026-10-14</span></footer>`;

function run(options: Parameters<typeof fakeGit>[0], readIndex = builtIndex()) {
  const { git, calls } = fakeGit(options);
  const commands: string[][] = [];
  const logs: string[] = [];
  const code = deploy({ git, readIndex, run: (command, args) => commands.push([command, ...args]), log: (m) => logs.push(m) });
  return { code, commands, logs, calls };
}

describe("deploy:pages", () => {
  it("refuses on a dirty tree, without running wrangler", () => {
    const { code, commands, logs } = run({ status: " M apps/web/src/main.ts\n?? notes.txt\n" });
    expect(code).toBe(1);
    expect(commands).toEqual([]);
    expect(logs.join("\n")).toMatch(/uncommitted or untracked/);
  });

  it("refuses when HEAD is not origin/main, after fetching it", () => {
    const { code, commands, logs, calls } = run({ head: OTHER });
    expect(code).toBe(1);
    expect(commands).toEqual([]);
    expect(calls[0]).toBe("fetch origin main");
    expect(logs.join("\n")).toMatch(/is not origin\/main/);
  });

  it("refuses without a build, or with a build of another commit", () => {
    const { git } = fakeGit();
    expect(refusal({ git, readIndex: () => null })).toMatch(/pnpm build/);
    expect(refusal({ git, readIndex: builtIndex(OTHER) })).toMatch(/was not built from a1b2c3d/);
  });

  it("deploys dist with the pinned wrangler when everything matches", () => {
    const { code, commands } = run({});
    expect(code).toBe(0);
    expect(WRANGLER).toMatch(/^wrangler@\d+\.\d+\.\d+$/);
    expect(commands).toEqual([["pnpm", "dlx", WRANGLER, "pages", "deploy", "dist", "--project-name", PROJECT, "--branch", "main"]]);
  });
});
