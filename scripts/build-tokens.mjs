#!/usr/bin/env node
// build-tokens.mjs — generates CSS variables from docs/design/tokens.json.
// Zero dependencies. Node >= 18. Usage:
//   node scripts/build-tokens.mjs          write the generated CSS file
//   node scripts/build-tokens.mjs --check   exit 1 if the file differs from what would be generated (writes nothing)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // repo root (parent of scripts/)
const TOKENS_PATH = join(ROOT, "docs/design/tokens.json");
const OUT_PATH = existsSync(join(ROOT, "src"))
  ? join(ROOT, "src/styles/tokens.css")
  : join(ROOT, "design/generated/tokens.css");

// ---------- load ----------
let raw;
try {
  raw = JSON.parse(readFileSync(TOKENS_PATH, "utf8"));
} catch (err) {
  console.error(`error: cannot read/parse ${TOKENS_PATH}: ${err.message}`);
  process.exit(1);
}

// ---------- flatten: every object with a $value is a token ----------
function flatten(node, path, out) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$")) continue; // $description, $type, $value handled per token
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Object.hasOwn(value, "$value")) {
        out.push({ path: [...path, key], token: value });
      } else {
        flatten(value, [...path, key], out);
      }
    }
  }
  return out;
}
const tokens = flatten(raw, [], []);
const byPath = new Map(tokens.map((t) => [t.path.join("."), t.token]));

// ---------- resolve {path.to.token} references (fail on unresolved or circular) ----------
const REF = /^\{([^}]+)\}$/;
function resolveValue(value, refChain) {
  if (typeof value === "string" && REF.test(value)) {
    const ref = value.slice(1, -1);
    if (refChain.includes(ref)) {
      throw new Error(`circular reference: ${[...refChain, ref].join(" -> ")}`);
    }
    const target = byPath.get(ref);
    if (!target) throw new Error(`unresolved reference: {${ref}}`);
    return resolveValue(target.$value, [...refChain, ref]);
  }
  return value;
}

// ---------- CSS variable name: path joined with "-", segment "semantic" removed ----------
function cssName(path) {
  return "--" + path.filter((s) => s !== "semantic").join("-");
}

// ---------- value formatting ----------
function formatValue(token, path) {
  const value = resolveValue(token.$value, [path.join(".")]);
  if (Array.isArray(value)) {
    // fontFamily: comma list, quote names containing spaces
    return value.map((name) => (/\s/.test(name) ? `"${name}"` : name)).join(", ");
  }
  if (typeof value === "number") return String(value); // number / fontWeight: no units
  if (typeof value === "string") return value;
  throw new Error(`unsupported $value at ${path.join(".")}: ${JSON.stringify(value)}`);
}

// ---------- generate ----------
let content;
try {
  const lines = [
    "/* AUTO-GENERATED from docs/design/tokens.json. DO NOT EDIT. */",
    ":root {",
    ...tokens.map((t) => `  ${cssName(t.path)}: ${formatValue(t.token, t.path)};`),
    "}",
  ];
  content = lines.join("\n") + "\n";
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}

// ---------- output / check ----------
const check = process.argv.includes("--check");
if (check) {
  if (!existsSync(OUT_PATH)) {
    console.error(`check FAILED: ${OUT_PATH} does not exist (run without --check to generate)`);
    process.exit(1);
  }
  const current = readFileSync(OUT_PATH, "utf8");
  if (current !== content) {
    console.error(`check FAILED: ${OUT_PATH} differs from what would be generated`);
    process.exit(1);
  }
  console.log(`check OK: ${OUT_PATH} is up to date (${tokens.length} tokens)`);
} else {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const existed = existsSync(OUT_PATH);
  const changed = !existed || readFileSync(OUT_PATH, "utf8") !== content;
  writeFileSync(OUT_PATH, content);
  console.log(`${existed ? (changed ? "updated" : "unchanged") : "created"} ${OUT_PATH} (${tokens.length} tokens)`);
}
