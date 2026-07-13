import fs from "fs";
import path from "path";
import { Casing, RojoNode } from "./types.js";

export interface RemovedPath {
	treePath: string;
	rojoPath: string;
}

export interface MissingPath {
	parent: RojoNode;
	key: string;
	path: string;
	absolutePath: string;
	treePath: string;
}

function hasPathPrefix(p: string, dir: string): boolean {
	return p === dir || p.startsWith(dir + "/");
}

export const toPosix = (p: string): string => p.split(path.sep).join("/");

export function applyCasing(value: string, casing: Casing): string {
	if (value.length === 0) return value;
	const firstCharacter = casing === "PascalCase"
		? value[0].toUpperCase()
		: value[0].toLowerCase();

	return firstCharacter + value.slice(1);
}

// WWS fork: extracts the path string from either $path shape ("p" or { optional: "p" }).
export function getPathString(node: RojoNode): string | undefined {
	const p = node.$path;
	if (typeof p === "string") return p;
	if (p && typeof p === "object" && typeof p.optional === "string") return p.optional;
	return undefined;
}

// WWS fork: generated Folder nodes set $ignoreUnknownInstances:false so the Rojo plugin removes
// stale instances (e.g. from files deleted while serve was stopped) instead of leaving unknown
// children in place, which is Rojo's default for project-defined nodes.
export function getOrCreateNode(parent: RojoNode, key: string, className?: string): RojoNode {
	if (!parent[key]) {
		parent[key] = className == null ? {} : { $className: className, $ignoreUnknownInstances: false };
	} else if (className != null) {
		// Node pre-seeded by the template (e.g. the wrapper folder holding Packages): still a
		// generated-owned folder, so apply the flag unless the template explicitly set it.
		const existing = parent[key] as RojoNode;
		if (existing.$ignoreUnknownInstances === undefined && existing.$path === undefined) {
			existing.$ignoreUnknownInstances = false;
		}
	}
	return parent[key] as RojoNode;
}

export function pruneObject(node: RojoNode, buildDir: string, outputDir: string, removed: RemovedPath[] = [], treePath = ""): RojoNode {
	for (const key in node) {
		const val = node[key];
		if (typeof val !== "object" || val === null) continue;

		const childTreePath = treePath ? `${treePath}.${key}` : key;
		const childNode = val as RojoNode;

		const childPath = getPathString(childNode);
		if (childPath) {
			if (hasPathPrefix(childPath, buildDir)) continue;

			// Optional paths are allowed to be absent — Rojo skips them without erroring —
			// so only required (string) template paths are pruned when missing.
			const isOptional = typeof childNode.$path === "object";
			if (!isOptional) {
				const absolutePath = path.resolve(outputDir, childPath);
				if (!fs.existsSync(absolutePath)) {
					delete node[key];
					removed.push({ treePath: childTreePath, rojoPath: childPath });
					continue;
				}
			}
		}
		pruneObject(childNode, buildDir, outputDir, removed, childTreePath);
	}
	return node;
}

export function sortObject<T>(obj: T): T {
	if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
		return obj;
	}

	const record = obj as Record<string, unknown>;

	return Object.keys(record)
		.sort()
		.reduce((acc: Record<string, unknown>, key: string) => {
			acc[key] = sortObject(record[key]);
			return acc;
		}, {}) as T;
}

export function findMissingPaths(node: RojoNode, buildDir: string, outputDir: string, missing: MissingPath[] = [], treePath = ""): MissingPath[] {
	for (const key in node) {
		const val = node[key];
		if (typeof val !== "object" || val === null) continue;

		const childTreePath = treePath ? `${treePath}.${key}` : key;
		const childNode = val as RojoNode;

		const childPath = getPathString(childNode);
		if (childPath && hasPathPrefix(childPath, buildDir)) {
			const absolutePath = path.resolve(outputDir, childPath);
			if (!fs.existsSync(absolutePath)) {
				missing.push({
					parent: node,
					key,
					treePath: childTreePath,
					path: childPath,
					absolutePath
				});
			}
		}
		findMissingPaths(childNode, buildDir, outputDir, missing, childTreePath);
	}
	return missing;
}
