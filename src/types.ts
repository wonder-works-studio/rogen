export interface CliArgs {
	help?: boolean;
	init?: boolean;
	config?: string;
	mode?: string;
	source?: string[];
	template?: string;
	output?: string;
	build?: string;
	watch?: boolean;
}

export interface RogenMode {
	output: string;
	build: string;
	// WWS fork: nests every routed node under one named folder (e.g. "src") instead of the
	// per-service server/client/shared namespace. `false` disables the namespace folder entirely.
	wrapper?: string | false;
}

export type Casing = "PascalCase" | "camelCase";

export interface RogenConfig {
	source?: string | string[];
	keepRouteNames?: boolean;
	casing?: Casing;
	aliases?: Record<string, string>;
	luau?: RogenMode;
	ts?: RogenMode;
	darklua?: RogenMode;
	template?: unknown;
	[key: string]: unknown;
}

export interface Environment {
	isTsProject: boolean;
	isDarkluaProject: boolean;
}

export interface RojoNode {
	$className?: string;
	// WWS fork: generated entries use Rojo's optional form so a deleted file/folder never leaves
	// the project referencing a required path that no longer exists.
	$path?: string | { optional: string };
	$ignoreUnknownInstances?: boolean;
	[key: string]: unknown;
}

export interface RojoTree {
	name?: string;
	emitLegacyScripts?: boolean;
	tree: RojoNode;
}
