# Design system

Patrata combines three directions chosen from twelve explored on a design canvas.

| Layer | Direction | Where it shows |
|---|---|---|
| Structure | **Vault**: strict monochrome | Sidebar, black decision slab, ruled metrics strip, ledger-style checks, KPI cards with a black top rule |
| Friendliness | **UPI Blue**: one bright accent | Primary buttons, the "Approvable offer" card, quick-action shortcuts, focus and links |
| Signature moment | **Receipt**: thermal slip | "Decision slip" on every result; it is also what prints or saves as PDF, with Key Fact Statement figures (EMI, interest, fee, APR) |

## Tokens (`frontend/src/index.css`)

| Token | Value | Use |
|---|---|---|
| `ink` | `#0A0A0A` | Text, black surfaces, dark buttons |
| `paper` | `#F4F4F5` | Page background |
| `line` | `#E4E4E7` | Hairline rules and card borders |
| `muted` | `#52525B` | Secondary text (meets 4.5:1 on white) |
| `brand` | `#1E4FD8` | The one accent: primary actions |
| `brand-bg` | `#EEF3FF` | Icon tiles, info notices |
| `ok` / `warn` / `bad` | `#047857` / `#B45309` / `#B42318` | Approve / Refer / Decline, always paired with text or an icon |

## Type

- **Archivo** (headings and numbers): strict, heavy, tabular figures.
- **Figtree** (body and controls): friendly and highly legible.
- **Courier Prime** (the slip only): thermal-printer feel.
- **Noto Sans Devanagari**: Hindi text everywhere.

## Rules

- Status is never colour alone: checks use a filled square (pass), an outline square (review) or a cross (fail), plus a word.
- One accent colour. Black for structure, blue for actions.
- Touch targets at least 44 px; real buttons and labels; works at phone width; installable as an app.
- No gradients, glass effects or emoji.
