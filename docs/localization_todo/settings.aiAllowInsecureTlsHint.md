# settings.aiAllowInsecureTlsHint

- **English value**: `Ignore invalid or self-signed certificates for AI provider requests. Use only for trusted local or internal endpoints.`
- **Namespace**: `settings`
- **File/component**: `src/settings/AiSettings.tsx`
- **UI role**: `fragment`
- **User flow**: `Shown in Settings → AI Assistant → Provider connection when configuring the active AI provider. The toggle lets users connect to trusted local or internal endpoints with self-signed or otherwise invalid TLS certificates.`
- **Tone**: `clear cautionary setup guidance`
- **Placeholders**: `none`
- **Domain notes**: `TLS, AI, and provider are technical terms. Preserve the security warning: this bypasses certificate validation and should only be used for trusted local or internal endpoints.`
