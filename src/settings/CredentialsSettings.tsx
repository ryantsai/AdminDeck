import { KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AI_PROVIDER_SECRET_OWNER_ID,
  aiProviderSecretOwnerId,
} from "../lib/settings";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { StoredCredentialKind, StoredCredentialSummary } from "../types";
import { CredentialDeleteConfirmDialog } from "./CredentialDeleteConfirmDialog";
import { groupCredentialsByKind, groupCredentialsForSettings } from "./credentialGroups";
import { SettingsSectionHeader } from "./shared";

function credentialKindKey(kind: StoredCredentialKind) {
  switch (kind) {
    case "connectionPassword":
      return "settings.credentialKindConnectionPassword";
    case "urlPassword":
      return "settings.credentialKindUrlPassword";
    case "aiApiKey":
      return "settings.credentialKindAiApiKey";
    case "widgetSecret":
      return "settings.credentialKindWidgetSecret";
    default:
      return "settings.credentialKindConnectionPassword";
  }
}

function credentialDescriptionKey(credential: StoredCredentialSummary) {
  if (!credential.exists) {
    return "settings.credentialMissingSecret";
  }
  switch (credential.kind) {
    case "aiApiKey":
      return "settings.credentialSavedApiKey";
    case "widgetSecret":
      return "settings.credentialSavedSecret";
    case "connectionPassword":
    case "urlPassword":
      return "settings.credentialSavedPassword";
    default:
      return "settings.credentialSavedPassword";
  }
}

export function CredentialsSettings() {
  const { t } = useTranslation();
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const aiProviderSettings = useWorkspaceStore((state) => state.aiProviderSettings);
  const setAiProviderHasApiKey = useWorkspaceStore((state) => state.setAiProviderHasApiKey);
  const [credentials, setCredentials] = useState<StoredCredentialSummary[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<StoredCredentialSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const { storedCredentials, widgetCredentials } = useMemo(
    () => groupCredentialsForSettings(credentials),
    [credentials],
  );
  const storedCredentialGroups = useMemo(
    () => groupCredentialsByKind(storedCredentials),
    [storedCredentials],
  );

  async function load() {
    if (!isTauriRuntime()) {
      setCredentials([]);
      return;
    }
    setLoading(true);
    try {
      setCredentials(await invokeCommand("list_stored_credentials", undefined));
    } catch (error) {
      showStatusBarNotice(error instanceof Error ? error.message : String(error), { tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function deleteCredential(credential: StoredCredentialSummary) {
    try {
      await invokeCommand("delete_stored_credential", {
        request: {
          kind: credential.kind,
          ownerId: credential.ownerId,
        },
      });
      if (credential.kind === "aiApiKey") {
        const [providerPresence, legacyPresence] = await Promise.all([
          invokeCommand("secret_exists", {
            request: {
              kind: "aiApiKey",
              ownerId: aiProviderSecretOwnerId(aiProviderSettings.providerKind),
            },
          }),
          invokeCommand("secret_exists", {
            request: {
              kind: "aiApiKey",
              ownerId: AI_PROVIDER_SECRET_OWNER_ID,
            },
          }),
        ]);
        setAiProviderHasApiKey(providerPresence.exists || legacyPresence.exists);
      }
      if (credential.kind === "urlPassword" || credential.kind === "connectionPassword") {
        window.dispatchEvent(new CustomEvent("kkterm:connection-tree-invalidated"));
      }
      showStatusBarNotice(t("settings.credentialDeleted"), { tone: "success" });
      await load();
    } catch (error) {
      showStatusBarNotice(error instanceof Error ? error.message : String(error), { tone: "error" });
    }
  }

  return (
    <section className="settings-card settings-section">
      <SettingsSectionHeader
        actions={
          <button className="toolbar-button" disabled={loading} onClick={() => void load()} type="button">
            <RefreshCw size={15} />
            {t("common.refresh")}
          </button>
        }
        icon={<KeyRound size={18} />}
        label={t("settings.sectionCredentials")}
        title={t("settings.credentialsTitle")}
      />

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.credentialsStored")}</legend>
        <p className="field-hint">{t("settings.credentialsHint")}</p>
        {storedCredentials.length === 0 ? (
          <p className="settings-empty-state">
            {loading ? t("common.loading") : t("settings.credentialsEmpty")}
          </p>
        ) : (
          <div className="settings-list" aria-label={t("settings.credentialsStored")}>
            {storedCredentialGroups.map(({ kind, rows }) => (
              <div className="settings-credential-group" key={kind}>
                <h3>{t(credentialKindKey(kind))}</h3>
                {rows.map((credential) => (
                  <CredentialRow
                    credential={credential}
                    key={credential.id}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.widgetCredentialsStored")}</legend>
        <p className="field-hint">{t("settings.widgetCredentialsHint")}</p>
        {widgetCredentials.length === 0 ? (
          <p className="settings-empty-state">
            {loading ? t("common.loading") : t("settings.widgetCredentialsEmpty")}
          </p>
        ) : (
          <div className="settings-list" aria-label={t("settings.widgetCredentialsStored")}>
            {widgetCredentials.map((credential) => (
              <CredentialRow
                credential={credential}
                key={credential.id}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </fieldset>

      {deleteTarget ? (
        <CredentialDeleteConfirmDialog
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const credential = deleteTarget;
            setDeleteTarget(null);
            void deleteCredential(credential);
          }}
        />
      ) : null}
    </section>
  );
}

function CredentialRow({
  credential,
  onDelete,
}: {
  credential: StoredCredentialSummary;
  onDelete: (credential: StoredCredentialSummary) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="settings-list-row">
      <div className="settings-credential-summary">
        <strong>{credential.label}</strong>
        <span>
          {credential.detail
            ? `${credential.detail} - ${t(credentialDescriptionKey(credential))}`
            : t(credentialDescriptionKey(credential))}
        </span>
      </div>
      <button
        aria-label={t("settings.deleteCredential")}
        className="settings-icon-danger-button"
        type="button"
        onClick={() => void onDelete(credential)}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
