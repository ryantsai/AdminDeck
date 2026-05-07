import { Database, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import type { UrlCredentialSummary, UrlDataPartitionSummary } from "../types";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function UrlSettings() {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState<UrlCredentialSummary[]>([]);
  const [partitions, setPartitions] = useState<UrlDataPartitionSummary[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function load() {
    if (!isTauriRuntime()) {
      return;
    }
    setError("");
    try {
      const [credentialRows, partitionRows] = await Promise.all([
        invokeCommand("list_url_credentials", undefined),
        invokeCommand("list_url_data_partitions", undefined),
      ]);
      setCredentials(credentialRows);
      setPartitions(partitionRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function deleteCredential(connectionId: string) {
    setStatus("");
    setError("");
    try {
      await invokeCommand("delete_url_credential", { connectionId });
      setStatus(t("settings.urlPasswordDeleted"));
      window.dispatchEvent(new CustomEvent("admindeck:connection-tree-invalidated"));
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  }

  async function clearPartition(name: string) {
    setStatus("");
    setError("");
    try {
      await invokeCommand("clear_url_data_partition", { name });
      setStatus(t("settings.urlDataShardCleared", { name }));
      window.dispatchEvent(new CustomEvent("admindeck:connection-tree-invalidated"));
      await load();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    }
  }

  return (
    <section className="settings-card settings-section">
      <div className="settings-section-header">
        <div>
          <p className="panel-label">{t("settings.sectionUrl")}</p>
          <h2>{t("settings.urlDefaults")}</h2>
        </div>
      </div>

      {status ? <p className="settings-status success">{status}</p> : null}
      {error ? <p className="settings-status error">{error}</p> : null}

      <div className="settings-subsection">
        <div className="settings-section-title">
          <KeyRound className="settings-section-icon" size={18} />
          <div>
            <h3 className="settings-section-heading">{t("settings.savedWebsitePasswords")}</h3>
            <p className="field-hint">{t("settings.savedWebsitePasswordsHint")}</p>
          </div>
        </div>
        {credentials.length === 0 ? (
          <p className="settings-empty-state">{t("settings.noSavedWebsitePasswords")}</p>
        ) : (
          <div className="settings-list" aria-label={t("settings.savedWebsitePasswords")}>
            {credentials.map((credential) => (
              <div className="settings-list-row" key={credential.connectionId}>
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
                <button
                  className="secondary-button danger"
                  type="button"
                  onClick={() => void deleteCredential(credential.connectionId)}
                >
                  <Trash2 size={15} />
                  {t("common.delete")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-subsection">
        <div className="settings-section-title">
          <Database className="settings-section-icon" size={18} />
          <div>
            <h3 className="settings-section-heading">{t("settings.urlDataShards")}</h3>
            <p className="field-hint">{t("settings.urlDataShardsHint")}</p>
          </div>
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
      </div>
    </section>
  );
}
