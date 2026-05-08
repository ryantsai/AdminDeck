import { ExternalLink, PackageOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ABOUT_PRODUCT, OPEN_SOURCE_COMPONENT_GROUPS, type OpenSourceComponent } from "./aboutData";
import { SettingsSummary } from "./shared";

function openSourceComponentCount() {
  return OPEN_SOURCE_COMPONENT_GROUPS.reduce(
    (count, group) => count + group.components.length,
    0,
  );
}

function OpenSourceComponentGroup({
  components,
  label,
}: {
  components: readonly OpenSourceComponent[];
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="open-source-group">
      <h3>{label}</h3>
      <div className="open-source-table" role="table" aria-label={t("settings.openSourceComponents")}>
        <div className="open-source-table-row header" role="row">
          <span role="columnheader">{t("settings.component")}</span>
          <span role="columnheader">{t("settings.version")}</span>
          <span role="columnheader">{t("settings.license")}</span>
          <span role="columnheader">{t("settings.role")}</span>
        </div>
        {components.map((component) => (
          <div className="open-source-table-row" key={component.name} role="row">
            <strong role="cell">{component.name}</strong>
            <span role="cell">{component.version}</span>
            <span role="cell">{component.license}</span>
            <span role="cell">{component.role}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AboutSettings() {
  const { t } = useTranslation();

  return (
    <section className="settings-card settings-section">
      <div className="settings-section-header">
        <div>
          <p className="panel-label">{t("settings.sectionAbout")}</p>
          <h2>{ABOUT_PRODUCT.name}</h2>
        </div>
        <a
          className="toolbar-button"
          href={ABOUT_PRODUCT.repositoryUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink size={15} />
          {t("settings.github")}
        </a>
      </div>

      <div className="about-hero">
        <div>
          <strong>{ABOUT_PRODUCT.name}</strong>
          <span>{t("settings.appSlogan")}</span>
        </div>
        <PackageOpen size={34} />
      </div>

      <div className="settings-summary-grid">
        <SettingsSummary label={t("settings.developer")} value={ABOUT_PRODUCT.developer} />
        <SettingsSummary label={t("settings.version")} value={ABOUT_PRODUCT.version} />
        <SettingsSummary label={t("settings.license")} value={ABOUT_PRODUCT.license} />
        <SettingsSummary label={t("settings.repository")} value={ABOUT_PRODUCT.repositoryUrl} />
      </div>

      <div className="open-source-panel">
        <div className="open-source-panel-header">
          <div>
            <strong>{t("settings.openSourceComponents")}</strong>
            <span>
              {t("settings.openSourceComponents")}
            </span>
          </div>
          <span>{t("settings.openSourceComponentCount", { count: openSourceComponentCount() })}</span>
        </div>
        <div className="open-source-groups">
          {OPEN_SOURCE_COMPONENT_GROUPS.map((group) => (
            <OpenSourceComponentGroup
              components={group.components}
              key={group.label}
              label={group.label}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
