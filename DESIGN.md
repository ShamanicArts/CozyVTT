---
name: CozyVTT
description: A warm, focused, crafted tabletop workbench where the shared scene stays central.
colors:
  table-green: "#4A5D4E"
  table-green-deep: "#2C3E2F"
  action-amber: "#D4A574"
  action-amber-hover: "#E89E5B"
  canvas-cream: "#FFF9E6"
  work-surface: "#F4ECD8"
  raised-surface: "#FBF7EE"
  recessed-surface: "#E0D4B8"
  primary-ink: "#1F2937"
  secondary-ink: "#6B605A"
  muted-ink: "#6B7280"
  paper: "#FEFEFE"
  danger: "#C0392B"
  spirit: "#9370DB"
typography:
  display:
    fontFamily: "var(--font-heading), Quicksand, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "var(--font-body), Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "var(--font-body), Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "var(--font-body), Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-body), Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.02em"
rounded:
  control: "8px"
  surface: "12px"
  overlay: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-amber}"
    textColor: "{colors.table-green-deep}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.table-green}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "36px"
  input:
    backgroundColor: "{colors.raised-surface}"
    textColor: "{colors.primary-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "38px"
  compact-chip:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.secondary-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
  authored-card:
    backgroundColor: "{colors.raised-surface}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.surface}"
    padding: "16px"
---

# Design System: CozyVTT

## 1. Overview

**Creative North Star: "The Living Table"**

CozyVTT is a quiet, adaptable frame around a living game. The shared scene, the current decision, and the people at the table carry the visual energy; application chrome is compact, stable, and willing to recede. Warmth comes from proportion, tactility, and authored campaign content rather than literal wood, parchment, medieval ornament, or a page-wide sepia wash.

The product is an object-first workbench. On desktop, the map or primary authored object occupies the stage while party context and session tools live in restrained rails. On tablet and mobile, the same regions become task-focused views reached through a persistent, thumb-friendly navigator. Layout is owned by CozyVTT and exposed through named, versioned regions: plugins may contribute to, order, resize, and hide those regions, but never replace the campaign shell with arbitrary unscoped UI.

The interface borrows Shuv to Code's spatial clarity, information density, continuous activity flow, and quiet stateful chrome without becoming a developer tool. Cards remain available for genuinely discrete authored objects. Ordinary structure uses alignment, tonal surfaces, lists, dividers, and whitespace. Mechanics and tool output remain prominent only while active, failed, or consequential, then collapse into readable summaries.

**Key Characteristics:**

- A dominant authored stage with compact contextual instruments.
- Warm, genre-neutral surfaces that let campaign art and themes provide flavour.
- Dense but calm utility chrome designed for long sessions.
- Continuous activity streams with progressive disclosure for mechanics.
- Responsive workspace regions shared by core features and plugins.
- Visible focus, honest state, and no horizontal overflow at supported sizes.

## 2. Colors

The default palette is a warm neutral table with botanical green structure and a sparingly used amber action signal. Installed themes may change the palette, but they must preserve the same semantic hierarchy and accessible contrast.

### Primary

- **Table Green:** The durable structural colour for active navigation, selected tools, focus, and sparse brand moments. It is never a page-wide fill.
- **Deep Table Green:** High-contrast text on amber actions and the strongest structural emphasis.

### Secondary

- **Action Amber:** The singular action accent for primary calls to action, initiative, attention, and selected mechanics.
- **Action Amber Hover:** A brighter responsive state, never a decorative gradient endpoint.

### Tertiary

- **Spirit Violet:** Reserved for the spirit layer and game state that semantically belongs to it. It is not a general-purpose accent.
- **Danger Red:** Reserved for destructive actions, failures, and dangerous game state.

### Neutral

- **Canvas Cream:** The quiet application canvas.
- **Work Surface:** Rails, grouped controls, and secondary workspace regions.
- **Raised Surface:** Inputs, menus, authored cards, and foreground controls.
- **Recessed Surface:** Selected rows, wells, and inset regions.
- **Primary Ink:** Main text and essential iconography.
- **Secondary Ink:** Supporting text and persistent labels.
- **Muted Ink:** Metadata and disabled information, never essential low-contrast copy.
- **Paper:** High-clarity overlays and printable or document-like surfaces.

**The One Signal Rule.** Action Amber is the only general action accent and occupies less than ten percent of a normal screen; its rarity makes it legible.

**The Flat Canvas Rule.** Canvas and structural surfaces are solid colours by default. Page-wide decorative gradients and default glass panels are forbidden.

**The Campaign Owns Flavour Rule.** Genre colour belongs to maps, portraits, system modules, themes, and campaign contributions, never to mandatory shell ornament.

## 3. Typography

**Display Font:** Theme heading family with Quicksand and system sans fallbacks

**Body Font:** Theme body family with Inter and system sans fallbacks

**Label/Mono Font:** JetBrains Mono only for coordinates, formulas, identifiers, and raw dice notation

**Character:** Utility chrome is humanist, compact, and stable. Expressive theme typography is restricted to campaign titles and authored display moments so a decorative theme can never make controls, tables, or mechanics harder to scan.

### Hierarchy

- **Display** (700, responsive 24–32px, 1.15): Campaign names and rare authored section openings, never ordinary panel headings.
- **Headline** (650, 18px, 1.3): Workspace and modal headings.
- **Title** (600, 15px, 1.35): Panel titles, tabs, prominent rows, and buttons.
- **Body** (400, 14px, 1.5): Messages, descriptions, and forms; prose columns stop near 70 characters.
- **Label** (600, 12px, 0.02em tracking): Metadata, control labels, compact status, and table headers. Sentence case is the default.

**The Stable Chrome Rule.** Theme display faces may decorate campaign identity, but navigation, controls, mechanics, and long-form activity always use the body family.

**The Quiet Hierarchy Rule.** Size changes are small and deliberate; establish hierarchy with weight, position, rhythm, and colour before increasing type size.

## 4. Elevation

CozyVTT is flat by default. Tonal layering, one-pixel boundaries, and spatial separation establish structure. Shadows appear only when an element physically overlays content, is being dragged, or must remain legible above a map; static rails and ordinary cards never receive ambient drop shadows.

### Shadow Vocabulary

- **Overlay:** A soft, wide shadow for menus, dialogs, and floating inspectors above the stage.
- **Dragged:** A tighter shadow for a currently dragged token, card, or dockable contribution.
- **Focus Halo:** A two-pixel brand-colour ring with a two-pixel surface offset, used for keyboard focus rather than depth.

**The Flat-by-Default Rule.** If every region casts a shadow, none of them has meaningful elevation. Resting workspace structure is tonal and border-led.

**The Map Exception Rule.** Controls placed directly over artwork may use a compact opaque surface and overlay shadow for legibility; transparency must never reduce control contrast.

## 5. Components

Components are compact, tactile, and restrained. Core and plugin UI use the same primitives and state language.

### Buttons

- **Shape:** Gently compact corners (8px) and a 36px desktop height; touch contexts expand to at least 44px.
- **Primary:** Action Amber with Deep Table Green text and 8px by 14px padding. One primary action per local decision group.
- **Hover / Focus:** Colour shift only on hover; visible two-pixel focus halo with a surface offset; no decorative lift.
- **Secondary / Ghost:** Secondary uses a one-pixel Table Green boundary. Ghost actions are borderless and acquire a recessed tonal background on hover or selection.

### Chips

- **Style:** Compact tonal capsule, 4px by 8px padding, used for role, status, disposition, and filters.
- **State:** Selected chips pair colour with an icon, check, weight, or text change. Colour alone never carries state.

### Cards / Containers

- **Corner Style:** Authored cards use 12px corners; overlays may use 16px.
- **Background:** Raised Surface for authored objects and Paper for document-like content.
- **Shadow Strategy:** No shadow at rest. See the flat-by-default rule.
- **Border:** One-pixel neutral boundary when tonal separation is insufficient.
- **Internal Padding:** 16px normally, 12px in compact lists, 24px only for spacious empty or onboarding states.

Cards are for campaigns, characters, creatures, assets, and other independently selectable objects. Rails, page sections, chat messages, dice results, system notices, statistics, and ordinary setting groups are not automatically cards.

### Inputs / Fields

- **Style:** Raised Surface fill, one-pixel muted boundary, 8px corners, 8px by 12px padding.
- **Focus:** Table Green border plus the shared focus halo; layout never shifts on focus.
- **Error / Disabled:** Errors pair Danger Red with text. Disabled fields remain readable and visibly unavailable without opacity alone.

### Navigation

Desktop navigation uses compact rails and tabs with stable positions, sentence-case labels, and tonal active states. Mobile navigation becomes a persistent bottom destination bar for Map, Party, Activity, Character, and contextual Actions. It never overflows horizontally, and important destinations do not hide behind an unlabeled overflow menu.

### Workspace Regions

The campaign shell exposes named regions for the header, navigator, stage, inspector, session tabs, map overlays, mobile navigation, and mobile sheets. Contributions declare version, identity, region, order, preferred size, visibility, and role constraints. The host owns lifecycle, ordering, persistence, responsive placement, and removal. A plugin may populate a known region; it may not mount arbitrary page chrome or replace the shell.

### Activity Entries

Chat, dice, system events, approvals, and plugin output share one continuous feed grammar. Sender and outcome lead. Mechanics are compact embeds with summary, state, timestamp, and an accessible details toggle. Active, failed, and consequential entries remain expanded; completed routine detail recedes without disappearing.

## 6. Do's and Don'ts

### Do:

- **Do** keep the map, shared fiction, or current authored object visually dominant.
- **Do** use 8px controls, 12px authored surfaces, compact 12–16px gaps, and one-pixel boundaries to create calm density.
- **Do** use cards for discrete authored objects when they improve recognition.
- **Do** collapse completed mechanics into readable summaries while keeping active, failed, and consequential state visible.
- **Do** make core features register through the same named, versioned workspace regions offered to plugins.
- **Do** provide real mobile play for map viewing, token movement, chat, rolls, character control, initiative, and approvals with 44px touch targets.
- **Do** let campaigns, themes, game systems, and plugins provide contextual flavour inside controlled regions.
- **Do** maintain WCAG 2.2 AA contrast, visible focus, reduced motion, and logical reading order.

### Don't:

- **Don't** build “a generic dashboard made from repeated equal-weight cards and hero metrics.”
- **Don't** create “a fantasy-themed interface that relies on wood, parchment, medieval type, or other genre assumptions for its identity.”
- **Don't** make “a direct visual copy of Shuv to Code or another developer tool.”
- **Don't** use “page-wide decorative gradients and glass panels as the default structure.”
- **Don't** present “every chat message, dice result, system notice, and tool operation as a separate prominent box.”
- **Don't** allow “plugin interfaces that inject arbitrary unscoped UI, bypass shared components, or determine the campaign shell for everyone.”
- **Don't** squeeze desktop geometry onto a small screen, permit horizontal overflow, or show “a mobile holding screen in place of useful play.”
- **Don't** leave “dense mechanics permanently occupying the interface after their consequence is understood.”
- **Don't** use cards as a reflex for rails, page sections, chat messages, statistics, or ordinary setting groups.
- **Don't** use colour alone to communicate role, selection, health, visibility, initiative, or danger.
