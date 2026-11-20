// Runs the unit tests with Vitest.
// Windows quirk: if the terminal's drive letter is lower-case (d:\ instead of
// D:\), Vitest can load itself twice and every test fails with
// "Cannot read properties of undefined (reading 'config')". We normalise it.
import { spawnSync } from "node:child_process";

const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const result = spawnSync("npx", ["vitest", "run", ...process.argv.slice(2)], { cwd, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
