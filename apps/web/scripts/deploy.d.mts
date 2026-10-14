export declare const WRANGLER: string;
export declare const PROJECT: string;

export interface DeployDeps {
  git: (args: string[]) => string;
  readIndex: () => string | null;
}

export declare function refusal(deps: DeployDeps): string | null;
export declare function deploy(
  deps: DeployDeps & { run: (command: string, args: string[]) => void; log: (message: string) => void },
): number;
