import fs from "fs";
import { build } from "../src/build.js";
import { CliArgs, Environment, RogenConfig, RogenMode, RojoTree } from "../src/types.js";
import { jest } from "@jest/globals";
import path from "path";
import { execute } from "../src/execute.js";

describe("Builder Integration", () => {
	beforeEach(() => {
		jest.restoreAllMocks();
	});

	it("should successfully build a tree and ignore non-Roblox files", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(true);

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");
			
			if (normalizedDir.endsWith("src")) {
				return [
					{ name: "systems", isDirectory: () => true, isFile: () => false },
					{ name: "ui", isDirectory: () => true, isFile: () => false },
					{ name: "ignoreMe.png", isDirectory: () => false, isFile: () => true },
					{ name: "Weapon.rbxm", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}
			
			if (normalizedDir.endsWith("systems")) {
				return [
					{ name: "Combat.server.lua", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			if (normalizedDir.endsWith("ui")) {
				return [
					{ name: "init.lua", isDirectory: () => false, isFile: () => true },
					{ name: "Button.lua", isDirectory: () => false, isFile: () => true } 
				] as fs.Dirent[];
			}

			return [];
		});

		const targetConfig: RogenMode = { build: "out", output: "test.project.json" };
		const baseTree: RojoTree = { name: "test-game", tree: {} };
		const config: RogenConfig = { source: "src" };
		const env: Environment = { isTsProject: false, isDarkluaProject: false };
		const cliArgs: CliArgs = {};

		const result = await build(targetConfig, baseTree, config, env, ["src"], cliArgs, process.cwd());
		const resultTree = result.tree.tree as any;

		expect(result.fileCount).toBe(3); 
		
		expect(result.name).toBe("test-game");
		expect(result.buildDir).toBe("out");
		expect(result.output).toBe(path.resolve(process.cwd(), "test.project.json"));

		expect(resultTree.ServerScriptService.server.systems.Combat).toBeDefined();
		expect(resultTree.ServerScriptService.server.systems.Combat.$path).toEqual({ optional: "out/systems/Combat.server.lua" });

		expect(resultTree.ReplicatedStorage.shared.Weapon).toBeDefined();
		expect(resultTree.ReplicatedStorage.shared.Weapon.$path).toEqual({ optional: "out/Weapon.rbxm" });

		expect(resultTree.ReplicatedStorage.shared.ui).toBeDefined();
		expect(resultTree.ReplicatedStorage.shared.ui.$path).toEqual({ optional: "out/ui" });
	});

	it("should successfully merge files from multiple source directories into single containers", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(true);

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");
			
			if (normalizedDir.endsWith("src/core")) {
				return [
					{ name: "CoreMath.lua", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}
			
			if (normalizedDir.endsWith("src/chapter1")) {
				return [
					{ name: "LevelData.lua", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			return [];
		});

		const targetConfig: RogenMode = { build: "out", output: "test.project.json" };
		const baseTree: RojoTree = { name: "test-game", tree: {} };
		const config: RogenConfig = { source: ["src/core", "src/chapter1"] };
		const env: Environment = { isTsProject: false, isDarkluaProject: false };
		const cliArgs: CliArgs = {};

		const result = await build(targetConfig, baseTree, config, env, ["src/core", "src/chapter1"], cliArgs, process.cwd());
		const resultTree = result.tree.tree as any;

		expect(result.fileCount).toBe(2); 

		expect(resultTree.ReplicatedStorage.shared.CoreMath).toBeDefined();
		expect(resultTree.ReplicatedStorage.shared.LevelData).toBeDefined();
		
		expect(resultTree.ReplicatedStorage.shared.CoreMath.$path).toEqual({ optional: "out/core/CoreMath.lua" });
		expect(resultTree.ReplicatedStorage.shared.LevelData.$path).toEqual({ optional: "out/chapter1/LevelData.lua" });
	});

	it("should treat a source reached via parent-dir navigation as a root without corrupting the build path", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(true);

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");

			if (normalizedDir.endsWith("src")) {
				return [
					{ name: "Combat.lua", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			return [];
		});

		const targetConfig: RogenMode = { build: "out", output: "test.project.json" };
		const baseTree: RojoTree = { name: "test-game", tree: {} };
		const config: RogenConfig = { source: "../../src" };
		const env: Environment = { isTsProject: false, isDarkluaProject: false };
		const cliArgs: CliArgs = {};

		const result = await build(targetConfig, baseTree, config, env, ["../../src"], cliArgs, process.cwd());
		const resultTree = result.tree.tree as any;

		expect(resultTree.ReplicatedStorage.shared.Combat.$path).toEqual({ optional: "out/Combat.lua" });
	});

	it("should compile TypeScript sources to .luau paths when the environment is a TS project", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(true);

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");

			if (normalizedDir.endsWith("src")) {
				return [
					{ name: "Weapon.ts", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			return [];
		});

		const targetConfig: RogenMode = { build: "out", output: "test.project.json" };
		const baseTree: RojoTree = { name: "test-game", tree: {} };
		const config: RogenConfig = { source: "src" };
		const env: Environment = { isTsProject: true, isDarkluaProject: false };
		const cliArgs: CliArgs = {};

		const result = await build(targetConfig, baseTree, config, env, ["src"], cliArgs, process.cwd());
		const resultTree = result.tree.tree as any;

		expect(resultTree.ReplicatedStorage.shared.Weapon.$path).toEqual({ optional: "out/Weapon.luau" });
	});


	it("should route files based on marker files instead of folder names", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(true);

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");
			
			if (normalizedDir.endsWith("src")) {
				return [
					{ name: "Database", isDirectory: () => true, isFile: () => false },
				] as fs.Dirent[];
			}
			
			if (normalizedDir.endsWith("Database")) {
				return [
					{ name: ".server", isDirectory: () => false, isFile: () => true },
					{ name: "query.lua", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			return [];
		});

		const targetConfig: RogenMode = { build: "out", output: "test.project.json" };
		const baseTree: RojoTree = { name: "test-game", tree: {} };
		const config: RogenConfig = { source: "src" };
		const env: Environment = { isTsProject: false, isDarkluaProject: false };
		const cliArgs: CliArgs = {};

		const result = await build(targetConfig, baseTree, config, env, ["src"], cliArgs, process.cwd());
		const resultTree = result.tree.tree as any;

		expect(result.fileCount).toBe(1); 
		
		expect(resultTree.ServerScriptService.server.Database.query).toBeDefined();
		expect(resultTree.ServerScriptService.server.Database.query.$path).toEqual({ optional: "out/Database/query.lua" });
	});

	it("should generate PascalCase tree names without changing source paths", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(true);

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");

			if (normalizedDir.endsWith("src")) {
				return [
					{ name: "features", isDirectory: () => true, isFile: () => false }
				] as fs.Dirent[];
			}

			if (normalizedDir.endsWith("features")) {
				return [
					{ name: "test", isDirectory: () => true, isFile: () => false }
				] as fs.Dirent[];
			}

			if (normalizedDir.endsWith("test")) {
				return [
					{ name: "testServiceUtils.luau", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			return [];
		});

		const targetConfig: RogenMode = { build: "out", output: "test.project.json" };
		const baseTree: RojoTree = { name: "test-game", tree: {} };
		const config: RogenConfig = { source: "src", casing: "PascalCase" };
		const env: Environment = { isTsProject: false, isDarkluaProject: false };

		const result = await build(targetConfig, baseTree, config, env, ["src"], {}, process.cwd());
		const node = (result.tree.tree as any).ReplicatedStorage.Shared.features.test.testServiceUtils;

		expect(node).toBeDefined();
		expect(node.$path).toEqual({ optional: "out/features/test/testServiceUtils.luau" });
	});

	it("should generate camelCase tree names by default without changing source paths", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(true);

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");

			if (normalizedDir.endsWith("src")) {
				return [
					{ name: "Features", isDirectory: () => true, isFile: () => false }
				] as fs.Dirent[];
			}

			if (normalizedDir.endsWith("Features")) {
				return [
					{ name: "Test", isDirectory: () => true, isFile: () => false }
				] as fs.Dirent[];
			}

			if (normalizedDir.endsWith("Test")) {
				return [
					{ name: "TestServiceUtils.luau", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			return [];
		});

		const targetConfig: RogenMode = { build: "out", output: "test.project.json" };
		const baseTree: RojoTree = { name: "test-game", tree: {} };
		const config: RogenConfig = { source: "src" };
		const env: Environment = { isTsProject: false, isDarkluaProject: false };

		const result = await build(targetConfig, baseTree, config, env, ["src"], {}, process.cwd());
		const node = (result.tree.tree as any).ReplicatedStorage.shared.Features.Test.TestServiceUtils;

		expect(node).toBeDefined();
		expect(node.$path).toEqual({ optional: "out/Features/Test/TestServiceUtils.luau" });
	});

	it("should resolve CLI output relative to cwd, but config output relative to anchor", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(false); 

		const targetConfig = { build: "out", output: "from-config.json" };
		const baseTree = { name: "test", tree: {} };
		const config = { source: "src" };
		const env = { isTsProject: false, isDarkluaProject: false };
		const anchor = "/mock/custom/anchor/path";

		const resultA = await build(targetConfig, baseTree, config, env, ["src"], {}, anchor);

		const expectedConfigPath = path.resolve(anchor, "from-config.json").replace(/\\/g, "/");
		expect(resultA.output.replace(/\\/g, "/")).toBe(expectedConfigPath);

		const cliArgs = { output: "from-cli.json" };
		const resultB = await build(targetConfig, baseTree, config, env, ["src"], cliArgs, anchor);
		
		const expectedCliPath = path.resolve(process.cwd(), "from-cli.json").replace(/\\/g, "/");
		expect(resultB.output.replace(/\\/g, "/")).toBe(expectedCliPath);
	});

	function mockMissingInitFolder() {
		jest.spyOn(fs, "existsSync").mockImplementation((p) => {
			const pathStr = String(p).replace(/\\/g, "/");
			if (pathStr.endsWith("test.json")) return false;
			if (pathStr.includes("out/MissingInitFolder")) return false;
			return true;
		});

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");
			if (normalizedDir.endsWith("src")) {
				return [{ name: "MissingInitFolder", isDirectory: () => true, isFile: () => false }] as fs.Dirent[];
			}
			if (normalizedDir.endsWith("MissingInitFolder")) {
				return [{ name: "init.lua", isDirectory: () => false, isFile: () => true }] as fs.Dirent[];
			}
			return [];
		});
	}

	it("should create a directory for missing extensionless paths in compiled (ts/darklua) projects", async () => {
		mockMissingInitFolder();
		const mkdirSpy = jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
		jest.spyOn(fs, "writeFileSync").mockImplementation(() => undefined as any);
		jest.spyOn(fs, "renameSync").mockImplementation(() => undefined as any);

		const env = { isTsProject: true, isDarkluaProject: false };
		const config = { source: "src", ts: { output: "test.json", build: "out" } };
		const anchor = process.cwd();

		await execute(["src"], env, [config.ts], { name: "test", tree: {} }, config, {}, anchor);

		const expectedDirPath = path.resolve(anchor, "out/MissingInitFolder");
		expect(mkdirSpy).toHaveBeenCalledWith(expectedDirPath, { recursive: true });
	});

	it("WWS: drops missing paths in luau projects instead of recreating them", async () => {
		mockMissingInitFolder();
		const mkdirSpy = jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
		let written = "";
		jest.spyOn(fs, "writeFileSync").mockImplementation(((_p: unknown, data: unknown) => { written = String(data); }) as any);
		jest.spyOn(fs, "renameSync").mockImplementation(() => undefined as any);

		const env = { isTsProject: false, isDarkluaProject: false };
		const config = { source: "src", luau: { output: "test.json", build: "out" } };
		const anchor = process.cwd();

		await execute(["src"], env, [config.luau], { name: "test", tree: {} }, config, {}, anchor);

		const expectedDirPath = path.resolve(anchor, "out/MissingInitFolder");
		expect(mkdirSpy).not.toHaveBeenCalledWith(expectedDirPath, { recursive: true });
		expect(written).not.toContain("MissingInitFolder");
	});

	it("should support Argon and Rojo data file types (JSON, TOML, YAML, CSV, etc.)", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(true);

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");

			if (normalizedDir.endsWith("src")) {
				return [
					{ name: "config.toml", isDirectory: () => false, isFile: () => true },
					{ name: "data.json", isDirectory: () => false, isFile: () => true },
					{ name: "locales.csv", isDirectory: () => false, isFile: () => true },
					{ name: "notes.txt", isDirectory: () => false, isFile: () => true },
					{ name: "README.md", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			return [];
		});

		const targetConfig: RogenMode = { build: "out", output: "test.project.json" };
		const baseTree: RojoTree = { name: "test-game", tree: {} };
		const config: RogenConfig = { source: "src" };
		const env: Environment = { isTsProject: false, isDarkluaProject: false };
		const cliArgs: CliArgs = {};

		const result = await build(targetConfig, baseTree, config, env, ["src"], cliArgs, process.cwd());
		const resultTree = result.tree.tree as any;

		expect(result.fileCount).toBe(5);

		expect(resultTree.ReplicatedStorage.shared.config.$path).toEqual({ optional: "out/config.toml" });
		expect(resultTree.ReplicatedStorage.shared.data.$path).toEqual({ optional: "out/data.json" });
		expect(resultTree.ReplicatedStorage.shared.locales.$path).toEqual({ optional: "out/locales.csv" });
		expect(resultTree.ReplicatedStorage.shared.notes.$path).toEqual({ optional: "out/notes.txt" });
		expect(resultTree.ReplicatedStorage.shared.README.$path).toEqual({ optional: "out/README.md" });
	});

	it("should create empty folders for directories containing .gitkeep or .keep files", async () => {
		jest.spyOn(fs, "existsSync").mockReturnValue(true);

		(jest.spyOn(fs.promises, "readdir") as jest.Mock<(dir: string) => Promise<any[]>>).mockImplementation(async (dir: string) => {
			const normalizedDir = String(dir).replace(/\\/g, "/");

			if (normalizedDir.endsWith("src")) {
				return [
					{ name: "EmptyFeatureA", isDirectory: () => true, isFile: () => false },
					{ name: "EmptyFeatureB", isDirectory: () => true, isFile: () => false },
					{ name: "IgnoredFeatureC", isDirectory: () => true, isFile: () => false }
				] as fs.Dirent[];
			}

			if (normalizedDir.endsWith("EmptyFeatureA")) {
				return [
					{ name: ".gitkeep", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			if (normalizedDir.endsWith("EmptyFeatureB")) {
				return [
					{ name: ".keep", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			if (normalizedDir.endsWith("IgnoredFeatureC")) {
				return [
					{ name: "ignoreMe.pdf", isDirectory: () => false, isFile: () => true }
				] as fs.Dirent[];
			}

			return [];
		});

		const targetConfig: RogenMode = { build: "out", output: "test.project.json" };
		const baseTree: RojoTree = { name: "test-game", tree: {} };
		const config: RogenConfig = { source: "src" };
		const env: Environment = { isTsProject: false, isDarkluaProject: false };
		const cliArgs: CliArgs = {};

		const result = await build(targetConfig, baseTree, config, env, ["src"], cliArgs, process.cwd());
		const resultTree = result.tree.tree as any;

		expect(result.fileCount).toBe(2);

		expect(resultTree.ReplicatedStorage.shared.EmptyFeatureA).toBeDefined();
		expect(resultTree.ReplicatedStorage.shared.EmptyFeatureA.$className).toBe("Folder");
		expect(resultTree.ReplicatedStorage.shared.EmptyFeatureA.$path).toBeUndefined();

		expect(resultTree.ReplicatedStorage.shared.EmptyFeatureB).toBeDefined();
		expect(resultTree.ReplicatedStorage.shared.EmptyFeatureB.$className).toBe("Folder");
		expect(resultTree.ReplicatedStorage.shared.EmptyFeatureB.$path).toBeUndefined();

		expect(resultTree.ReplicatedStorage.shared.IgnoredFeatureC).toBeUndefined();
	});
});
