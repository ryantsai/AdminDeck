# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

### settings.customFonts
- **English value:** Custom fonts
- **Namespace:** `settings`
- **File/component:** `src/settings/AppearanceSettings.tsx`
- **UI role:** select optgroup label
- **Flow/context:** Settings → Appearance → App UI font family dropdown; groups fonts discovered in the `fonts` folder beside the app executable.
- **Tone:** Short, neutral settings label.
- **Placeholders:** None.
- **Domain notes:** Refers to user-provided app UI font files, not terminal font settings.

### settings.openCustomFontsFolder
- **English value:** Open fonts folder
- **Namespace:** `settings`
- **File/component:** `src/settings/AppearanceSettings.tsx`
- **UI role:** button text, aria-label, and title
- **Flow/context:** Button beside the App UI font family dropdown; opens or creates the `fonts` folder next to the AdminDeck executable.
- **Tone:** Direct action label.
- **Placeholders:** None.
- **Domain notes:** The folder name is literally `fonts` on disk and should stay lowercase/English if referenced explicitly.

### settings.customFontsHint
- **English value:** Custom fonts are loaded from the fonts folder beside the app executable. Supported files: .ttf, .otf, .woff, and .woff2.
- **Namespace:** `settings`
- **File/component:** `src/settings/AppearanceSettings.tsx`
- **UI role:** field hint
- **Flow/context:** Shown under the App UI font family control when at least one custom font was discovered.
- **Tone:** Informational, concise.
- **Placeholders:** None.
- **Domain notes:** Keep file extensions verbatim and mention the literal `fonts` folder.

### settings.noCustomFonts
- **English value:** No custom fonts found. Add .ttf, .otf, .woff, or .woff2 files to the fonts folder beside the app executable.
- **Namespace:** `settings`
- **File/component:** `src/settings/AppearanceSettings.tsx`
- **UI role:** empty-state field hint
- **Flow/context:** Shown under the App UI font family control when the `fonts` folder contains no supported font files.
- **Tone:** Helpful empty state.
- **Placeholders:** None.
- **Domain notes:** Keep file extensions verbatim and mention the literal `fonts` folder.
