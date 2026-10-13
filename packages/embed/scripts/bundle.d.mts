export declare const publishedName: (file: string) => string;
export declare function bundle(outDir?: string): Promise<{ outDir: string; version: string; fonts: string[]; bytes: number }>;
