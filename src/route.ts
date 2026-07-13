import path from "path";
import { 
	serviceAliases, 
	serverContainers, 
	clientContainers
} from "./constants.js";
import { toPosix } from "./tree.js";
import { RogenMode } from "./types.js";

interface FolderRoutingResult {
	targetService: string;
	virtualParts: string[];
	lastRouteKeyword: string | null;
	environmentKeyword: string | null;
	// WWS fork: true when a folder keyword (Server/Client/…) set the service, so a file's affix
	// must not override it.
	folderKeywordMatched: boolean;
}

export interface RoutingMaps {
	mergedServices: Record<string, string>;
	lowerCaseMap: Record<string, string>;
	separatorSuffixRegex: RegExp;
	pascalCaseSuffixRegex: RegExp;
	separatorPrefixRegex: RegExp;
	camelCasePrefixRegex: RegExp;
}

export interface RouteContext extends RogenMode {
	source: string | string[];
	isTsProject: boolean;
	emitLegacyScripts: boolean;
	name: string;
	routingMaps: RoutingMaps;
	keepRouteNames: boolean;
	directoryMarkers?: Record<string, string>;
}

interface AffixResult {
	mappedService: string;
	matchedLength: number;
	exactMatch: string;
	environmentKeyword?: string;
	isPrefix: boolean;
}

interface RouteResolution {
	targetService: string;
	wrapperFolder: string;
	virtualParts: string[];
	nodeName: string;
	projectPath: string;
}

function resolveFolderRouting(parts: string[], directoryMarkers: Record<string, string> | undefined, routingMaps: RoutingMaps): FolderRoutingResult {
	const { lowerCaseMap } = routingMaps;
	const virtualParts: string[] = [];
	
	let targetService = "ReplicatedStorage";
	let lastRouteKeyword: string | null = null;
	let environmentKeyword: string | null = null;
	let folderKeywordMatched = false;

	// Root marker routing
	if (directoryMarkers && directoryMarkers[""]) {
		const rootMarker = directoryMarkers[""];
		targetService = lowerCaseMap[rootMarker];
		lastRouteKeyword = rootMarker;
		if (serviceAliases.has(rootMarker)) {
			environmentKeyword = rootMarker;
		}
	}

	// Folder path routing
	let currentPath = "";
	let index = 0;
	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;

		const lowerPart = part.toLowerCase();
		const matchedService = lowerCaseMap[lowerPart];
		const marker = directoryMarkers ? directoryMarkers[currentPath] : undefined;

		// WWS fork: a "Shared" folder at the source root is preserved as a real folder
		// (e.g. ReplicatedStorage/src/Shared/...) rather than consumed as a routing keyword.
		const isRootShared = lowerPart === "shared" && index === 0;

		if (marker) {
			targetService = lowerCaseMap[marker];
			lastRouteKeyword = marker;
			if (serviceAliases.has(marker)) {
				environmentKeyword = marker;
			}

			// Strip if the folder name is also a routing keyword
			if (!matchedService) {
				virtualParts.push(part);
			}
		} else if (matchedService && !isRootShared) {
			targetService = matchedService;
			lastRouteKeyword = lowerPart;
			folderKeywordMatched = true;
			if (serviceAliases.has(lowerPart)) {
				environmentKeyword = lowerPart;
			}
		} else {
			virtualParts.push(part);
		}

		index++;
	}

	return { targetService, virtualParts, lastRouteKeyword, environmentKeyword, folderKeywordMatched };
}

function resolveAffixes(basename: string, isInit: boolean, routingMaps: RoutingMaps): AffixResult | null {
	const { lowerCaseMap, mergedServices, separatorSuffixRegex, pascalCaseSuffixRegex } = routingMaps;

	let match = basename.match(separatorSuffixRegex);
	if (match && match[0].length < basename.length) {
		const suffix = match[1].toLowerCase();
		return {
			mappedService: lowerCaseMap[suffix],
			matchedLength: match[0].length,
			exactMatch: match[0],
			environmentKeyword: (!isInit && serviceAliases.has(suffix)) ? suffix : undefined,
			isPrefix: false
		};
	}

	match = basename.match(pascalCaseSuffixRegex);
	if (match && match[0].length < basename.length) {
		const suffix = match[1].toLowerCase();
		return {
			mappedService: mergedServices[match[1]],
			matchedLength: match[0].length,
			exactMatch: match[0],
			environmentKeyword: (!isInit && serviceAliases.has(suffix)) ? suffix : undefined,
			isPrefix: false
		};
	}

	// WWS fork: prefix routing (separatorPrefixRegex / camelCasePrefixRegex) is intentionally
	// disabled so feature files whose names begin with a service keyword (e.g. StarterPackOffer,
	// ClientTouched, ServerStats) are neither rerouted nor renamed.

	return null;
}

function getWrapperFolder(targetService: string, environmentKeyword: string | null): string {
	if (serverContainers.has(targetService)) return "server";
	if (clientContainers.has(targetService)) return "client";
	if (environmentKeyword) return environmentKeyword;
	return "shared";
}

export function resolveRoute(relativePath: string, isInit: boolean, context: RouteContext): RouteResolution {
	const { emitLegacyScripts, isTsProject, build, routingMaps, keepRouteNames, directoryMarkers } = context;

	const parts = relativePath.split(/[\\/]/);
	const filename = parts.pop()!;
	const basename = path.basename(filename, path.extname(filename));

	// Folder and marker routing
	const { targetService: folderTarget, virtualParts, lastRouteKeyword, environmentKeyword: folderEnv, folderKeywordMatched } = resolveFolderRouting(parts, directoryMarkers, routingMaps);

	// Affix routing
	const affix = resolveAffixes(basename, isInit, routingMaps);

	// Resolve overrides. WWS fork: a folder keyword wins over a file affix (so e.g.
	// ReplicatedFirst/Loader.client.luau stays in ReplicatedFirst); the affix suffix is still
	// stripped from the node name below.
	const affixOverrides = affix && !folderKeywordMatched;
	let targetService = affixOverrides ? affix.mappedService : folderTarget;
	const environmentKeyword = (affixOverrides ? affix.environmentKeyword : folderEnv) ?? folderEnv;

	// Resolve namespace wrapper folder. WWS fork: a configured `wrapper` overrides the per-service
	// server/client/shared namespace; `false` disables the namespace folder entirely.
	const wrapperFolder = context.wrapper !== undefined
		? (context.wrapper === false ? "" : context.wrapper)
		: getWrapperFolder(targetService, environmentKeyword);

	// Edge case: Scripts with non-legacy RunContext run incorrectly in StarterPlayer container,
	// hence they need to be put in ReplicatedStorage.
	const isStarterPlayerContainer = targetService === "StarterPlayerScripts" || targetService === "StarterCharacterScripts";
	if (emitLegacyScripts === false && isStarterPlayerContainer) {
		targetService = "ReplicatedStorage";
	}

	// Node naming and path formatting
	let nodeName = basename;
	let projectPath: string;

	if (isInit) {
		const folderRelativePath = path.dirname(relativePath);
		projectPath = toPosix(path.join(build, folderRelativePath));
		
		if (virtualParts.length > 0) {
			nodeName = virtualParts.pop()!;
		} else {
			nodeName = lastRouteKeyword ? lastRouteKeyword : "source";
		}
	} else {
		let compiledRelativePath = relativePath;
		if (isTsProject) {
			const compiledFilename = filename.replace(/\.tsx?$/i, ".luau");
			compiledRelativePath = path.join(path.dirname(relativePath), compiledFilename);
		}
		projectPath = toPosix(path.join(build, compiledRelativePath));

		if (affix) {
			let shouldStrip = !keepRouteNames;

			// Rojo relies on '.server' and '.client' explicitly for script types.
			// Even if keepRouteNames is true, we must strip these exact dot-prefixes.
			if (keepRouteNames) {
				const exactMatch = affix.exactMatch.toLowerCase();
				if (exactMatch === ".server" || exactMatch === ".client") {
					shouldStrip = true;
				}
			}

			if (shouldStrip) {
				if (affix.isPrefix) {
					nodeName = basename.slice(affix.matchedLength);
				} else {
					nodeName = basename.slice(0, -affix.matchedLength); 
				}
			}
		} 
	}

	return { targetService, wrapperFolder, virtualParts, nodeName, projectPath };
}