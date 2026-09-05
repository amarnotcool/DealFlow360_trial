---
name: DealFlow360 Executive Studio
colors:
  surface: '#f9f9ff'
  surface-dim: '#d8d9e2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3fc'
  surface-container: '#ecedf6'
  surface-container-high: '#e7e8f1'
  surface-container-highest: '#e1e2eb'
  on-surface: '#191c22'
  on-surface-variant: '#484833'
  inverse-surface: '#2e3037'
  inverse-on-surface: '#eff0f9'
  outline: '#797861'
  outline-variant: '#c9c8ad'
  surface-tint: '#5f6200'
  primary: '#5f6200'
  on-primary: '#ffffff'
  primary-container: '#e9f034'
  on-primary-container: '#686c00'
  inverse-primary: '#c8cf00'
  secondary: '#984710'
  on-secondary: '#ffffff'
  secondary-container: '#fe965a'
  on-secondary-container: '#723000'
  tertiary: '#5e5e60'
  on-tertiary: '#ffffff'
  tertiary-container: '#e8e6e9'
  on-tertiary-container: '#676769'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4eb2f'
  primary-fixed-dim: '#c8cf00'
  on-primary-fixed: '#1c1d00'
  on-primary-fixed-variant: '#474a00'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#ffb68f'
  on-secondary-fixed: '#331100'
  on-secondary-fixed-variant: '#773200'
  tertiary-fixed: '#e3e2e4'
  tertiary-fixed-dim: '#c7c6c8'
  on-tertiary-fixed: '#1b1c1e'
  on-tertiary-fixed-variant: '#464749'
  background: '#f9f9ff'
  on-background: '#191c22'
  surface-variant: '#e1e2eb'
typography:
  display-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  title-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-xs:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 2.5rem
  space-3xl: 3rem
  gutter-grid: 1.25rem
  margin-screen: 2rem
---

## Brand & Style

This design system delivers an executive-grade, hyper-tactile B2B operational environment tailored for high-velocity CPQ (Configure, Price, Quote), automated inventory orchestration, and billing management. 

Merging the warmth of atmospheric minimalism with tactile neo-glassmorphism and vibrant chromatic accents, the aesthetic repudiates sterile corporate monotony. The user experience evokes absolute operational lucidity, premium craftsmanship, and rapid decision-making velocity. Visual tension is deliberately maintained between a warm, muted ambient backdrop and bold, high-contrast focal surfaces—specifically electric chartreuse/lemon yellow, warm terracotta/peach orange, and obsidian deep slate containers.

## Colors

The palette is engineered around high-contrast visual anchors against a soothing, warm atmospheric canvas:

- **Canvas & Backdrops:**
  - Base Atmospheric Gradient: Sweeps softly from `#EAE8E3` (top-left) to `#E5E3DD` (bottom-right), enriched with soft ambient light bleeds of subtle amber and chartreuse.
  - Surface Frosted Container: `#FFFFFF` at 65%–85% opacity with an ultra-thin 1px border (`rgba(255, 255, 255, 0.60)`).
- **Chromatic Focal Accents:**
  - **Primary Electric Lemon (`#E9F034`):** Employed for pivotal metric cards, active navigational pills, high-priority status indicators, and prime calls to action. Paired with dark slate typography (`#141517`) for optimal legibility.
  - **Secondary Tangerine / Peach (`#F58F54`):** Used for logistical tracking, warning thresholds, mid-tier demand tags, and secondary metric summaries.
  - **Obsidian Dark Surface (`#141517`):** Forms dramatic focal product anchors, floating popover cards, and reorder stages, utilizing crisp white (`#FFFFFF`) and muted slate (`#8E9199`) typography.
  - **Status Electric Blue (`#1C8BFF`):** Reserved exclusively for neutral/low-demand states and informational system tags to provide balanced visual triad balance alongside lemon and orange.
- **Typography & Structural Neutrals:**
  - High-emphasis Headings: `#141517`
  - Body & Table Data: `#2C2E33`
  - Subtle Labels / Column Headers: `#73757D`
  - Hairline Dividers & Table Strokes: `rgba(20, 21, 23, 0.06)`

## Typography

Plus Jakarta Sans is specified across all hierarchy tiers. Its geometric clarity, wide aperture, and clean modern terminals allow large display metrics to pop with authority, while complex data tables, SKUs, and monetary figures remain legible at small point sizes.

- Numbers and financial values must utilize tabular lining figures (`font-variant-numeric: tabular-nums`) to ensure vertical alignment across data grids.
- Display titles use tight negative tracking (`-0.03em`) for a condensed, premium editorial polish.
- Micro labels and column metadata preserve distinct legibility through medium/semibold weights (`500`/`600`) and slight positive tracking (`+0.01em` to `+0.02em`).

## Layout & Spacing

The layout is built on a responsive 12-column fluid grid system paired with a persistent floating navigation rail:

- **Navigation Rail:** A slim 72px fixed frosted left rail (`rgba(255, 255, 255, 0.40)`) housing pill-shaped icon triggers.
- **Header & Action Bar:** Top utility bar with an 8-column layout anchor, housing contextual breadcrumbs, location pills, date selectors, and system controls.
- **Metric Stage (Top Tier):** 3-column asymmetric layout (e.g., 4-col Orders chart, 4-col Stock breakdown, 4-col Dark Reorders hero spotlight).
- **Tabular Data Hub (Lower Tier):** Spans the entire 12 columns, cushioned inside a frosted, translucent white vessel with unified filter pills.
- **Breakpoints:**
  - Desktop (`>= 1280px`): Full 12-column layout with fixed left rail and multi-card top dashboard.
  - Tablet (`768px - 1279px`): 8-column fluid grid. Metric cards reflow into a 2x2 grid. Rail condenses to a fixed bottom pill bar.
  - Mobile (`< 768px`): Single-column stack. High-impact cards scroll horizontally (snap carousel); tables convert into stacked tactile record cards.

## Elevation & Depth

Visual depth is achieved through translucent layered surfaces and ultra-soft, diffused ambient shadows rather than harsh drop-shadows:

- **Level 0 (Atmospheric Canvas):** Base gradient background (`#EAE8E3` to `#E5E3DD`).
- **Level 1 (Substrate Cards):** Translucent frosted cards (`rgba(255, 255, 255, 0.70)`), backed by `backdrop-filter: blur(20px)` and framed with `1px solid rgba(255, 255, 255, 0.65)`. Box shadow: `0 8px 32px -4px rgba(20, 21, 23, 0.04)`.
- **Level 2 (High-Contrast Metric Blocks & Dark Heroes):** Solid `#E9F034`, `#F58F54`, and `#141517` modules. Cast subtle warm-tinted ambient glow:
  - Chartreuse Glow: `0 12px 28px -6px rgba(233, 240, 52, 0.35)`.
  - Tangerine Glow: `0 12px 28px -6px rgba(245, 143, 84, 0.30)`.
  - Obsidian Depth: `0 16px 36px -8px rgba(20, 21, 23, 0.18)`.
- **Level 3 (Interactive Floating Pills & Dropdowns):** Pure `#FFFFFF` or `#E9F034` buttons with `box-shadow: 0 4px 14px -2px rgba(20, 21, 23, 0.08), 0 1px 2px rgba(20, 21, 23, 0.04)`.

## Shapes

The design system employs a soft, pill-forward shape philosophy:

- **Buttons, Search Inputs, and Badges:** Fully rounded continuous pill radii (`9999px`), delivering a friendly, tactile, and easily tappable interaction footprint.
- **Metric Cards and Dashboard Containers:** Curvature of `28px` to `32px` (`rounded-3xl`), eliminating sharp structural edges and harmonizing with the pill elements nested within.
- **Product Thumbnail Frames:** Nested rounded rectangles (`16px` to `20px`) inside dark and light surfaces, preserving generous interior gutters.
- **Table Container Surfaces:** Sweeping `28px` border radius with softly inset table rows.

## Components

### Buttons & Action Controls
- **Primary Pill Action:** `#E9F034` fill, `#141517` typography/icon, fully rounded (`9999px`), padded with `0.625rem 1.25rem`. Hover introduces a subtle translateY(-1px) and an expanded chartreuse ambient glow.
- **Secondary Glass Action:** `rgba(255, 255, 255, 0.85)` fill, `1px solid rgba(255, 255, 255, 0.90)`, dark slate text, subtle drop shadow.
- **Icon Utility Button:** Square pill (`40px x 40px`, `rounded-full`), floating white background with delicate 1px border.

### Search & Filter Controls
- **Global Search Pill:** Generous 44px height, frosted white surface (`rgba(255, 255, 255, 0.75)`), subtle inner search icon, placeholder in `#73757D`, fully rounded.
- **Dropdown Filter Pills:** Floating pill triggers with inline chevron icons, displaying active parameter keys with clear values (e.g., `Supplier: Jaunt`).

### Status Badges & Demand Chips
- **High Demand / Critical Warning:** Tangerine pill (`#F58F54`) with dark slate typography and an inline energy/lightning icon.
- **Low Demand / Stable Status:** Electric Sky pill (`#1C8BFF`) with crisp white typography.
- **Neutral / Delay Tracking:** Glass pill with an orange alert dot and inline latency counter (`Delay +2d`).

### Cards & Dashboards Containers
- **Vibrant Graphic Metric Cards:** Saturated background (`#E9F034` or `#F58F54`), featuring clean headline counts, bar graph overlays, custom geometric pie/donut slices, and a top-right circular filter button.
- **Obsidian Focal Card:** `#141517` background housing hardware preview graphics, status pills, bold pricing details, and an embedded quick-action button.

### Tables & Data Grids
- **Header:** Lightweight slate text (`#73757D`), uppercase or small title-case, spacious padding without hard vertical dividing lines.
- **Row Architecture:** Alternating subtle hover states (`rgba(255, 255, 255, 0.50)`), product thumbnail preview with rounded dark backing, aligned monetary columns, pill status badge, and an overflow triple-dot utility trigger.
- **Selection:** Soft rounded checkboxes (`rounded-md`, 6px radius) matching the brand border and fill characteristics.