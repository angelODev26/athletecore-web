#!/usr/bin/env node
// check-hardcoded-styles.mjs — fails on hardcoded styles in app code:
// hex colors, rgb()/rgba()/hsl()/hsla() literals, --color-primitive-* usage,
// and Tailwind-style arbitrary values for color/spacing/radius/type.
// Zero dependencies. Node >= 18. Exits 1 on any violation.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPTS_DIR = join(ROOT, "scripts");

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", ".opencode", ".claude", "docs", "dist", "build", ".next", "coverage",
]);
const EXTENSIONS = new Set([
  "css", "scss", "sass", "less", "js", "jsx", "ts", "tsx", "vue", "svelte", "html", "astro",
]);
const GENERATED_TOKENS = join(ROOT, "src/styles/tokens.css");

// ---------- patterns ----------
const HEX_COLOR = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const RGB_RGBA = /rgba?\(/i;
const HSL_HSLA = /hsla?\(/i;
const PRIMITIVE_VAR = /--color-primitive-/;
// Tailwind-style arbitrary values for color/spacing/radius/type, e.g. bg-[#0e1118], p-[13px]
const TW_PREFIXES = [
  // color
  "bg", "text", "border", "from", "via", "to", "ring", "fill", "stroke", "accent",
  "decoration", "outline", "shadow", "caret", "divide",
  // spacing / sizing
  "p", "px", "py", "pt", "pr", "pb", "pl", "m", "mx", "my", "mt", "mr", "mb", "ml",
  "gap", "gap-x", "gap-y", "space-x", "space-y", "w", "h", "min-w", "min-h", "max-w", "max-h",
  "size", "size-x", "size-y", "inset", "top", "right", "bottom", "left",
  // radius
  "rounded", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl",
  // typography
  "font", "text", "leading", "tracking",
];
const TW_ARBITRARY = new RegExp(`\\b(?:${[...new Set(TW_PREFIXES)].sort((a, b) => b.length - a.length).join("|")})-\\[[^\\]]*\\]`);
const CHECKS = [
  { re: HEX_COLOR, msg: "hardcoded hex color" },
  { re: RGB_RGBA, msg: "rgb()/rgba() literal" },
  { re: HSL_HSLA, msg: "hsl()/hsla() literal" },
  { re: PRIMITIVE_VAR, msg: "use of --color-primitive-* outside the tokens files" },
  { re: TW_ARBITRARY, msg: "Tailwind arbitrary value for color/spacing/radius/type" },
];

// ---------- collect files ----------
function collect(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.isDirectory()) {
      // hidden dirs: skip the excluded ones, but do not skip unreferenced hidden dirs (none are scanned anyway)
      if (EXCLUDED_DIRS.has(entry.name)) continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collect(full, out);
    } else if (entry.isFile()) {
      const ext = entry.name.includes(".") ? entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase() : "";
      if (EXTENSIONS.has(ext)) out.push(full);
    }
  }
  return out;
}
const files = collect(ROOT, []).filter((f) => f !== GENERATED_TOKENS && !f.startsWith(SCRIPTS_DIR));

// ---------- scan ----------
const violations = [];
let scanned = 0;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes("design-lint-ignore")) return; // skipped line
    for (const check of CHECKS) {
      if (check.re.test(line)) {
        violations.push({ file: relative(ROOT, file), line: i + 1, msg: check.msg, text: line.trim() });
        break; // one violation per line is enough to flag it
      }
    }
  });
  scanned++;
}

if (scanned === 0) {
  console.log("hardcoded-styles check OK (no files matched the scanned extensions)");
  process.exit(0);
}
for (const v of violations) {
  console.error(`${v.file}:${v.line}: ${v.msg}`);
  console.error(`  ${v.text}`);
}
console.log(`${scanned} files scanned, ${violations.length} violations`);
if (violations.length > 0) {
  console.error("hardcoded-styles check FAILED — replace each value with a semantic token from src/styles/tokens.css (see DESIGN.md)");
  process.exit(1);
}
console.log("hardcoded-styles check OK");
