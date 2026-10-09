#!/usr/bin/env node
// check-contrast.mjs — WCAG 2.x contrast check for the allowed fg/bg pairs in docs/design/contrast.json.
// Zero dependencies. Node >= 18. Exits 1 if any pair fails.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TOKENS_PATH = join(ROOT, "docs/design/tokens.json");
const CONTRAST_PATH = join(ROOT, "docs/design/contrast.json");

// ---------- load tokens and resolve to final values ----------
const raw = JSON.parse(readFileSync(TOKENS_PATH, "utf8"));
function flatten(node, path, out) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Object.hasOwn(value, "$value")) out.push({ path: [...path, key], token: value });
      else flatten(value, [...path, key], out);
    }
  }
  return out;
}
const tokens = flatten(raw, [], []);
const byPath = new Map(tokens.map((t) => [t.path.join("."), t.token]));

const REF = /^\{([^}]+)\}$/;
function resolveValue(value, refChain) {
  if (typeof value === "string" && REF.test(value)) {
    const ref = value.slice(1, -1);
    if (refChain.includes(ref)) throw new Error(`circular reference: ${[...refChain, ref].join(" -> ")}`);
    const target = byPath.get(ref);
    if (!target) throw new Error(`unresolved reference: {${ref}}`);
    return resolveValue(target.$value, [...refChain, ref]);
  }
  return value;
}
function hexOf(pathUnderSemantic) {
  const full = `color.semantic.${pathUnderSemantic}`;
  const token = byPath.get(full);
  if (!token) throw new Error(`unknown token: ${full}`);
  const value = resolveValue(token.$value, [full]);
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`${full} does not resolve to a #rrggbb hex color (got ${JSON.stringify(value)})`);
  }
  return value;
}

// ---------- WCAG 2.x contrast ratio ----------
function channel(c) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastRatio(hexFg, hexBg) {
  const l1 = luminance(hexFg);
  const l2 = luminance(hexBg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------- run ----------
const { pairs } = JSON.parse(readFileSync(CONTRAST_PATH, "utf8"));
const rows = [];
let failures = 0;
for (const pair of pairs) {
  let ratio, status, error = null;
  try {
    ratio = contrastRatio(hexOf(pair.fg), hexOf(pair.bg));
    status = ratio >= pair.min ? "PASS" : "FAIL";
  } catch (err) {
    error = err.message;
    ratio = NaN;
    status = "FAIL";
  }
  if (status === "FAIL") failures++;
  rows.push({ fg: pair.fg, bg: pair.bg, ratio, min: pair.min, status, error });
}

const w = {
  fg: Math.max("fg".length, ...rows.map((r) => r.fg.length)),
  bg: Math.max("bg".length, ...rows.map((r) => r.bg.length)),
};
console.log(`${"fg".padEnd(w.fg)}  ${"bg".padEnd(w.bg)}  ${"ratio".padStart(6)}  ${"min".padStart(4)}  result`);
console.log("-".repeat(w.fg + w.bg + 24));
for (const r of rows) {
  const ratio = Number.isNaN(r.ratio) ? "  n/a" : r.ratio.toFixed(2).padStart(6);
  console.log(`${r.fg.padEnd(w.fg)}  ${r.bg.padEnd(w.bg)}  ${ratio}  ${String(r.min).padStart(4)}  ${r.status}${r.error ? `  (${r.error})` : ""}`);
}
console.log("-".repeat(w.fg + w.bg + 24));
console.log(`${pairs.length} pairs checked, ${failures} failed`);
if (failures > 0) {
  console.error("contrast check FAILED");
  process.exit(1);
}
console.log("contrast check OK");
