import { Globe, Pencil, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { UrlCredentialSummary, UrlDataPartitionSummary } from "../types";
import { SettingsSectionHeader } from "./shared";
import { ToggleSwitch } from "./ToggleSwitch";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

interface UrlCredentialEditDraft {
  username: string;
  password: string;
  usernameSelector: string;
  passwordSelector: string;
}

function draftFromCredential(credential: UrlCredentialSummary): UrlCredentialEditDraft {
  return {
    username: credential.username,
    password: "",
    usernameSelector: credential.usernameSelector ?? "",
    passwordSelector: credential.passwordSelector ?? "",
  };
}

export function UrlSettings() {
  const { t } = useTranslation();
  const urlSettings = useWorkspaceStore((state) => state.urlSettings);
  const setUrlSettings = useWorkspaceStore((state) => state.setUrlSettings);
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [draft, setDraft] = useState(urlSettings);
  const [credentials, setCredentials] = useState<UrlCredentialSummary[]>([]);
  const [partitions, setPartitions] = useState<UrlDataPartitionSummary[]>([]);
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [credentialDraft, setCredentialDraft] = useState<UrlCredentialEditDraft | null>(null);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(urlSettings);

  useEffect(() => {
    setDraft(urlSettings);
  }, [urlSettings]);

  async function load() {
    if (!isTauriRuntime()) {
      return;
    }
    try {
      const [credentialRows, partitionRows] = await Promise.all([
        invokeCommand("list_url_credentials", undefined),
        invokeCommand("list_url_data_partitions", undefined),
      ]);
      setCredentials(credentialRows);
      setPartitions(partitionRows);
      if (editingCredentialId && !credentialRows.some((credential) => credential.connectionId === editingCredentialId)) {
        setEditingCredentialId(null);
        setCredentialDraft(null);
      }
    } catch (loadError) {
      showStatusBarNotice(loadError instanceof Error ? loadError.message : String(loadError), { tone: "error" });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSave() {
    try {
      const saved = isTauriRuntime() ? await invokeCommand("update_url_settings", { request: draft }) : draft;
      setUrlSettings(saved);
      setDraft(saved);
      showStatusBarNotice(t("settings.urlSettingsSaved"), { tone: "success" });
    } catch (saveError) {
      showStatusBarNotice(saveError instanceof Error ? saveError.message : String(saveError), { tone: "error" });
    }
  }

  async function deleteCredential(connectionId: string) {
    try {
      await invokeCommand("delete_url_credential", { connectionId });
      showStatusBarNotice(t("settings.urlPasswordDeleted"), { tone: "success" });
      if (editingCredentialId === connectionId) {
        setEditingCredentialId(null);
        setCredentialDraft(null);
      }
      window.dispatchEvent(new CustomEvent("kkterm:connection-tree-invalidated"));
      await load();
    } catch (deleteError) {
      showStatusBarNotice(deleteError instanceof Error ? deleteError.message : String(deleteError), { tone: "error" });
    }
  }

  function beginCredentialEdit(credential: UrlCredentialSummary) {
    setEditingCredentialId(credential.connectionId);
    setCredentialDraft(draftFromCredential(credential));
  }

  function cancelCredentialEdit() {
    setEditingCredentialId(null);
    setCredentialDraft(null);
  }

  function updateCredentialDraft(field: keyof UrlCredentialEditDraft, value: string) {
    setCredentialDraft((currentDraft) => (currentDraft ? { ...currentDraft, [field]: value } : currentDraft));
  }

  async function saveCredentialEdit(connectionId: string) {
    if (!credentialDraft) {
      return;
    }
    try {
      if (credentialDraft.password) {
        await invokeCommand("store_secret", {
          request: {
            kind: "urlPassword",
            ownerId: connectionId,
            secret: credentialDraft.password,
          },
        });
      }
      await invokeCommand("upsert_url_credential", {
        request: {
          connectionId,
          username: credentialDraft.username,
          pageUrl: credentials.find((credential) => credential.connectionId === connectionId)?.pageUrl,
          usernameSelector: credentialDraft.usernameSelector || undefined,
          passwordSelector: credentialDraft.passwordSelector || undefined,
        },
      });
      showStatusBarNotice(t("settings.urlPasswordUpdated"), { tone: "success" });
      setEditingCredentialId(null);
      setCredentialDraft(null);
      window.dispatchEvent(new CustomEvent("kkterm:connection-tree-invalidated"));
      await load();
    } catch (saveError) {
      showStatusBarNotice(saveError instanceof Error ? saveError.message : String(saveError), { tone: "error" });
    }
  }

  async function clearPartition(name: string) {
    try {
      await invokeCommand("clear_url_data_partition", { name });
      showStatusBarNotice(t("settings.urlDataShardCleared", { name }), { tone: "success" });
      window.dispatchEvent(new CustomEvent("kkterm:connection-tree-invalidated"));
      await load();
    } catch (clearError) {
      showStatusBarNotice(clearError instanceof Error ? clearError.message : String(clearError), { tone: "error" });
    }
  }

  return (
    <section className="settings-card settings-section">
      <SettingsSectionHeader
        actions={
          <button className="toolbar-button" disabled={!hasChanges} onClick={() => void handleSave()} type="button">
            <Save size={15} />
            {t("settings.save")}
          </button>
        }
        icon={<Globe size={18} />}
        label={t("settings.sectionUrl")}
        title={t("settings.urlDefaults")}
      />

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.urlSecurity")}</legend>
        <div>
          <p className="field-hint">{t("settings.urlSecurityHint")}</p>
        </div>
        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.ignoreCertificateErrors}
              onChange={(checked) =>
                setDraft((settings) => ({ ...settings, ignoreCertificateErrors: checked }))
              }
            />
            <span>
              <strong>{t("settings.ignoreCertificateErrors")}</strong>
              <small>{t("settings.ignoreCertificateErrorsHint")}</small>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.savedWebsitePasswords")}</legend>
        <div>
          <p className="field-hint">{t("settings.savedWebsitePasswordsHint")}</p>
        </div>
        {credentials.length === 0 ? (
          <p className="settings-empty-state">{t("settings.noSavedWebsitePasswords")}</p>
        ) : (
          <div className="settings-list" aria-label={t("settings.savedWebsitePasswords")}>
            {credentials.map((credential) => (
              <div className="settings-list-row" key={credential.connectionId}>
                {editingCredentialId === credential.connectionId && credentialDraft ? (
                  <>
                    <div className="settings-credential-edit">
                      <div className="settings-list-row-heading">
                        <strong>{credential.connectionName}</strong>
                        <span>{credential.url ?? t("settings.notSet")}</span>
                      </div>
                      <div className="form-grid two-columns">
                        <label>
                          <span>{t("settings.urlCredentialUsername")}</span>
                          <input
                            autoComplete="username"
                            value={credentialDraft.username}
                            onChange={(event) => updateCredentialDraft("username", event.currentTarget.value)}
                          />
                        </label>
                        <label>
                          <span>{t("settings.urlCredentialPassword")}</span>
                          <input
                            autoComplete="new-password"
                            placeholder={t("settings.urlCredentialPasswordPlaceholder")}
                            type="password"
                            value={credentialDraft.password}
                            onChange={(event) => updateCredentialDraft("password", event.currentTarget.value)}
                          />
                        </label>
                        <label>
                          <span>{t("settings.urlCredentialUsernameSelector")}</span>
                          <input
                            value={credentialDraft.usernameSelector}
                            onChange={(event) => updateCredentialDraft("usernameSelector", event.currentTarget.value)}
                          />
                        </label>
                        <label>
                          <span>{t("settings.urlCredentialPasswordSelector")}</span>
                          <input
                            value={credentialDraft.passwordSelector}
                            onChange={(event) => updateCredentialDraft("passwordSelector", event.currentTarget.value)}
                          />
                        </label>
                      </div>
                      <small>{t("settings.urlPasswordDetails", {
                        username: credential.username,
                        updatedAt: formatDate(credential.updatedAt),
                      })}</small>
                    </div>
                    <div className="settings-list-actions">
                      <button
                        className="secondary-button"
                        disabled={credentialDraft.username.trim().length === 0}
                        type="button"
                        onClick={() => void saveCredentialEdit(credential.connectionId)}
                      >
                        <Save size={15} />
                        {t("common.save")}
                      </button>
                      <button className="secondary-button" type="button" onClick={cancelCredentialEdit}>
                        <X size={15} />
                        {t("common.cancel")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <strong>{credential.connectionName}</strong>
                      <span>{credential.url ?? t("settings.notSet")}</span>
                      <small>
                        {t("settings.urlPasswordDetails", {
                          username: credential.username,
                          updatedAt: formatDate(credential.updatedAt),
                        })}
                      </small>
                    </div>
                    <div className="settings-list-actions">
                      <button className="secondary-button" type="button" onClick={() => beginCredentialEdit(credential)}>
                        <Pencil size={15} />
                        {t("common.edit")}
                      </button>
                      <button
                        className="secondary-button danger"
                        type="button"
                        onClick={() => void deleteCredential(credential.connectionId)}
                      >
                        <Trash2 size={15} />
                        {t("common.delete")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.urlDataShards")}</legend>
        <div>
          <p className="field-hint">{t("settings.urlDataShardsHint")}</p>
        </div>
        {partitions.length === 0 ? (
          <p className="settings-empty-state">{t("settings.noUrlDataShards")}</p>
        ) : (
          <div className="settings-list" aria-label={t("settings.urlDataShards")}>
            {partitions.map((partition) => (
              <div className="settings-list-row" key={partition.name}>
                <div>
                  <strong>{partition.name}</strong>
                  <span>
                    {t(
                      partition.connectionCount === 1
                        ? "settings.urlDataShardConnectionCount"
                        : "settings.urlDataShardConnectionCountPlural",
                      { count: partition.connectionCount },
                    )}
                  </span>
                </div>
                <button
                  className="secondary-button danger"
                  type="button"
                  onClick={() => void clearPartition(partition.name)}
                >
                  <Trash2 size={15} />
                  {t("settings.clearShard")}
                </button>
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </section>
  );
}
