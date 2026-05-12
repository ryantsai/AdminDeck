# Localization Backlog

Each pending English string lives in its own file in this directory. One key per file. This replaces the previous single `docs/LOCALIZATION.md` so feature branches can add or remove pending strings without colliding.

## Filename Convention

`<namespace>.<keyPath>.md` — dots from the i18n key path stay as dots, slashes are not allowed.

Examples:
- `ai.dashboardToolsDisabledTitle.md`
- `settings.general.languageHint.md`

## Flow

When you add or change an English key in `src/i18n/locales/en.json` and do **not** translate it into the other 12 locales in the same change:

1. Copy `_TEMPLATE.md` to `<namespace>.<keyPath>.md`.
2. Fill in every field.
3. Commit the file alongside the `en.json` change.

When you (or a localization pass) translate the key into every supported locale:

1. Update each non-English locale file under `src/i18n/locales/`.
2. **Delete** the matching `docs/localization_todo/<namespace>.<keyPath>.md` file.

When you rename or remove a key:

1. Update `en.json` and every non-English locale that touched the key.
2. Rename or delete the matching `docs/localization_todo/*.md` file to match.

## Why per-file

The previous single-file backlog generated merge conflicts on every feature branch that touched UI strings. Per-key files let independent branches add, remove, and translate entries without touching shared lines.

## Template

See [`_TEMPLATE.md`](_TEMPLATE.md). Do not edit `_TEMPLATE.md` for a real string — copy it first.
