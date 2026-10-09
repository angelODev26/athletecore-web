---
name: design-tokens
description: Procedure to add, change, review or audit AthleteCore Web design tokens and components. Use when a UI task needs a color, spacing, radius, type size or component variant that DESIGN.md does not provide, when changing the palette, or when running the design checks.
---

# design-tokens

Owner: `design-system-keeper`. Other agents only use step 0 and step 1 to file a request.

## 0. Before anything
Read `DESIGN.md` and `docs/design/tokens.json`. Most needs are already covered by an existing semantic token.

## 1. Filing a request (any UI agent)
Do not edit tokens. Send `design-system-keeper` this message:
- Need: what you need to express (e.g. "text color for a warning count")
- Where: screen/component
- Closest existing token and why it is not enough
- Contrast context: which surface it sits on

## 2. Deciding (design-system-keeper)
Approve only if: (a) it cannot be solved with an existing token, (b) it has a semantic name describing a role, not a color (`status-pending`, not `orange`), (c) it respects the hard rules in DESIGN.md (red only for errors, info distinct from primary, etc.). Otherwise reject and name the existing token to use. Never change an existing primitive value (blue/indigo/violet/neutral) without explicit user approval.

## 3. Applying a change
1. Add primitives (if a new raw color is truly needed) under `color.primitive`, then the semantic token referencing it under `color.semantic`. Components must only ever use semantic tokens.
2. Add every legitimate fg/bg combination for the new token to `docs/design/contrast.json` (4.5 for text, 3 for UI components). A combination not listed is not allowed.
3. Run:
   ```
   node scripts/build-tokens.mjs
   node scripts/check-contrast.mjs
   node scripts/check-hardcoded-styles.mjs
   ```
   All must pass. If contrast fails, adjust the NEW token, not existing ones.
4. Update the role table / component catalog in `DESIGN.md` (and the "Not defined" list if a gap was closed).
5. Report: what was added, why, contrast results, which request it answers.

## 4. Auditing drift
Run `node scripts/check-hardcoded-styles.mjs` and `node scripts/build-tokens.mjs --check`. Report violations with file:line and the semantic token that should replace each.

## 5. Keeping OpenCode and Claude Code in sync
This skill, the agents and the instructions exist for both tools. `.opencode/agents` and `.opencode/skills` are canonical; `.claude/agents` and `.claude/skills` are mirrors maintained by hand. After changing any agent or skill file, edit the `.opencode` version, then apply the same body change yourself to the `.claude/` copy (bodies identical; frontmatter is tool-specific and never copied across). Never let the two trees diverge.
