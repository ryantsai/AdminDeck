# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

### ai.pastedImageSource

- English value: `Pasted image`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: label
- Surrounding user flow: User pastes an image into the AI Assistant composer and the composer shows the attached image preview.
- Tone: Short, neutral, descriptive.
- Placeholder details: None.
- Domain notes: Refers to an image/screenshot pasted from the clipboard, not a saved Connection or Session artifact.

### ai.imageInputNotSupported

- English value: `This model does not support image input, so pasted screenshots are not sent.`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: status notice
- Surrounding user flow: User pastes a screenshot or has an image context while the selected AI provider/model cannot accept image input.
- Tone: Subtle, factual, non-blocking.
- Placeholder details: None.
- Domain notes: "Model" means the selected AI model in Settings/assistant picker; image input means multimodal image content sent to the provider API.

### ai.pastedImageSourceWithNumber

- English value: `Pasted image {{number}}`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: label
- Surrounding user flow: User pastes multiple images into the AI Assistant composer and each attached preview gets a numbered source label.
- Tone: Short, neutral, descriptive.
- Placeholder details: `{{number}}` is a 1-based index for the pasted image within the paste action.
- Domain notes: Refers to images/screenshots pasted from the clipboard, not saved Connections or Sessions.

### ai.pastedImages

- English value: `Pasted images ({{count}})`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: section label
- Surrounding user flow: User has one or more pasted image attachments staged above the AI Assistant input.
- Tone: Short, neutral, descriptive.
- Placeholder details: `{{count}}` is the number of currently staged image attachments.
- Domain notes: Refers only to pending pasted image attachments in the composer.

### ai.removeImageAttachment

- English value: `Remove {{label}}`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: button aria-label and tooltip
- Surrounding user flow: User removes a single pasted image attachment from the AI Assistant composer before sending.
- Tone: Direct action label.
- Placeholder details: `{{label}}` is the image attachment label, such as `Pasted image 1`.
- Domain notes: Removing only detaches the pending image from the outgoing AI Assistant prompt.

### ai.openImagePreview

- English value: `Open {{label}} preview`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: button aria-label and tooltip
- Surrounding user flow: User clicks a small image attachment preview in the AI Assistant chat history to open a larger preview dialog.
- Tone: Direct action label.
- Placeholder details: `{{label}}` is the stored image attachment label, such as `Pasted image 1` or a screenshot source label.
- Domain notes: Opens an in-app preview of an already stored chat attachment; it does not send the image again or persist new data.

### ai.imagePreviewTitle

- English value: `{{label}} preview`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: dialog aria-label
- Surrounding user flow: User has opened a larger preview dialog for an image attachment from AI Assistant chat history.
- Tone: Short, descriptive.
- Placeholder details: `{{label}}` is the stored image attachment label, such as `Pasted image 1` or a screenshot source label.
- Domain notes: Refers to the in-app preview dialog for an already stored chat attachment.

