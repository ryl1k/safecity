# @safecity/design-tokens

Where the **Claude Design** output lands. Both clients consume the SAME tokens so the
wheelchair / blind / low-vision themes stay in sync.

```
src/
  color.ts        base palette + semantic rating set (full/partial/none/unknown)
  typography.ts   fluid scale (survives 200% text scaling)
  space.ts radius.ts elevation.ts focus.ts
  themes/         standard · high-contrast+large · dark
```

Exports a **Tailwind preset** (web) and a **theme object** (mobile).
Semantic rating tokens must always pair color with an icon + label (never color-only).

KB: `11 · Accessibility Standards`, `02 · The Map`.
