// Enforces the project's core promise: ZERO runtime dependencies.
// Fails the build if `dependencies` (or `peer`/`optional`/`bundled` deps) is
// non-empty. devDependencies are allowed. Run in CI on every push/PR.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const buckets = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundledDependencies",
  "bundleDependencies",
];

const offenders = [];
for (const b of buckets) {
  const v = pkg[b];
  const names = Array.isArray(v) ? v : Object.keys(v ?? {});
  if (names.length > 0) offenders.push(`${b}: ${names.join(", ")}`);
}

if (offenders.length > 0) {
  console.error("❌ aeo-image must have ZERO runtime dependencies, but found:");
  for (const o of offenders) console.error("   - " + o);
  console.error(
    "\nThis is a hard project invariant. If a dependency is truly needed, " +
      "it must be discussed first — see CONTRIBUTING.md.",
  );
  process.exit(1);
}

console.log("✅ Zero runtime dependencies confirmed.");
