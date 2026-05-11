# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

- `ai.attachedFiles`
  - English: `Attached files ({{count}})`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: label
  - Flow: AI Assistant composer, after the user chooses one or more non-image files from the `+` menu.
  - Tone: concise desktop UI label.
  - Placeholders: `{{count}}` is the number of currently attached files.
  - Domain notes: These are transient AI Assistant context attachments, not durable wiki or SFTP attachments.

- `ai.removeFileAttachment`
  - English: `Remove {{label}}`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: aria-label/tooltip
  - Flow: AI Assistant composer file attachment preview remove button.
  - Tone: direct action label.
  - Placeholders: `{{label}}` is the selected file name.
  - Domain notes: Removing the attachment only removes it from the pending AI Assistant prompt.

- `ai.fileTooLarge`
  - English: `{{name}} is larger than 10 MB.`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: status/warning
  - Flow: AI Assistant composer file picker rejects a selected file over the per-file attachment cap.
  - Tone: plain warning.
  - Placeholders: `{{name}}` is the selected file name.
  - Domain notes: The size limit applies to transient AI Assistant file/photo context only.

- `ai.preparingResponse`
  - English: `Preparing response...`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: status
  - Flow: AI Assistant chat after submit, before the streaming assistant response message exists.
  - Tone: brief neutral progress text.
  - Placeholders: none.
  - Domain notes: This replaces the rotating novelty waiting phrase during request setup only.

- `ai.workedFor`
  - English: `Worked for {{duration}}`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: disclosure label
  - Flow: AI Assistant completed response, collapsed work summary above the final answer.
  - Tone: concise activity summary.
  - Placeholders: `{{duration}}` is a compact elapsed time such as `42s` or `5m 09s`.
  - Domain notes: Summarizes thinking and tool calling time for one assistant response.

- `ai.thinkingStep`
  - English: `Thinking`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: timeline item label
  - Flow: AI Assistant work timeline while reasoning content is streamed or available.
  - Tone: short process label.
  - Placeholders: none.
  - Domain notes: Refers to model reasoning/thinking display, not the user's thought process.

- `ai.toolCallRunning`
  - English: `Running`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: timeline item status
  - Flow: AI Assistant work timeline for an active tool call.
  - Tone: short status label.
  - Placeholders: none.
  - Domain notes: Applies to web/search/file/time assistant tools.

- `ai.toolCallComplete`
  - English: `Complete`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: timeline item status
  - Flow: AI Assistant work timeline for a finished tool call.
  - Tone: short status label.
  - Placeholders: none.
  - Domain notes: Applies to web/search/file/time assistant tools.

- `ai.workDurationUnderSecond`
  - English: `<1s`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: elapsed-time fragment
  - Flow: AI Assistant completed work summary when elapsed time rounds below one second.
  - Tone: compact technical duration.
  - Placeholders: none.
  - Domain notes: Used inside `ai.workedFor`.

- `ai.workDurationSeconds`
  - English: `{{count}}s`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: elapsed-time fragment
  - Flow: AI Assistant completed work summary for durations under one minute.
  - Tone: compact technical duration.
  - Placeholders: `{{count}}` is whole seconds.
  - Domain notes: Used inside `ai.workedFor`.

- `ai.workDurationMinutesSeconds`
  - English: `{{minutes}}m {{seconds}}s`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: elapsed-time fragment
  - Flow: AI Assistant completed work summary for durations of one minute or longer.
  - Tone: compact technical duration.
  - Placeholders: `{{minutes}}` is whole minutes; `{{seconds}}` is remaining whole seconds.
  - Domain notes: Used inside `ai.workedFor`.

- `ai.toolWebSearchDone`
  - English: `Searched the web`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: timeline item label
  - Flow: AI Assistant work timeline after a web search tool call completes.
  - Tone: short completed action.
  - Placeholders: none.
  - Domain notes: The underlying tool is `web_search`.

- `ai.toolWebFetchDone`
  - English: `Fetched web page`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: timeline item label
  - Flow: AI Assistant work timeline after a web page fetch tool call completes.
  - Tone: short completed action.
  - Placeholders: none.
  - Domain notes: The underlying tool is `web_fetch`.

- `ai.toolShellCommandDone`
  - English: `Ran command`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: timeline item label
  - Flow: AI Assistant work timeline after a shell command tool call completes.
  - Tone: short completed action.
  - Placeholders: none.
  - Domain notes: Assistant shell tools are approval/safety bounded by provider settings.

- `ai.toolFileSearchDone`
  - English: `Searched files`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: timeline item label
  - Flow: AI Assistant work timeline after an app-data file search tool call completes.
  - Tone: short completed action.
  - Placeholders: none.
  - Domain notes: The underlying tool is scoped to app data.

- `ai.toolFileReadDone`
  - English: `Read file`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: timeline item label
  - Flow: AI Assistant work timeline after an app-data file read tool call completes.
  - Tone: short completed action.
  - Placeholders: none.
  - Domain notes: The underlying tool is scoped to app data.

- `ai.toolCurrentTimeDone`
  - English: `Checked current time`
  - Namespace: `ai`
  - File/component: `src/ai/AssistantPanel.tsx`
  - UI role: timeline item label
  - Flow: AI Assistant work timeline after the current-time tool call completes.
  - Tone: short completed action.
  - Placeholders: none.
  - Domain notes: The underlying tool is `current_time`.
