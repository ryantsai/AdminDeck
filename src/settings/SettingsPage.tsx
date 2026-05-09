import { useState } from "react";
import {
  ArrowLeft,
  Bot,
  Camera,
  Info,
  Monitor,
  Globe,
  Network,
  Palette,
  Server,
  Settings as SettingsIcon,
  Terminal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AI_PROVIDER_SECRET_OWNER_ID } from "../lib/settings";
import { AboutSettings } from "./AboutSettings";
import { AiSettings } from "./AiSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { GeneralSettings } from "./GeneralSettings";
import { RdpSettings } from "./RdpSettings";
import { SshSettings } from "./SshSettings";
import { ScreenshotSettings } from "./ScreenshotSettings";
import { TerminalSettings as TerminalSettingsPage } from "./TerminalSettings";
import { UrlSettings } from "./UrlSettings";
import { VncSettings } from "./VncSettings";

export { AI_PROVIDER_SECRET_OWNER_ID };

type SettingsSectionId =
  | "general-settings"
  | "appearance-settings"
  | "assistant-settings"
  | "ssh-settings"
  | "terminal-settings"
  | "screenshot-settings"
  | "url-settings"
  | "rdp-settings"
  | "vnc-settings"
  | "about-settings";

export function SettingsPage({
  onBack,
  onResetLayout,
}: {
  onBack: () => void;
  onResetLayout: () => void;
}) {
  const { t } = useTranslation();
  const [activeSectionId, setActiveSectionId] =
    useState<SettingsSectionId>("general-settings");

  return (
    <main className="settings-page">
      <header className="settings-page-header">
        <div>
          <p className="panel-label">AdminDeck</p>
          <h1>{t("settings.title")}</h1>
        </div>
        <button className="toolbar-button" type="button" onClick={onBack}>
          <ArrowLeft size={15} />
          {t("settings.workspace")}
        </button>
      </header>

      <div className="settings-layout">
        <aside className="settings-nav" aria-label={t("settings.sectionsNav")}>
          <button
            className={settingsNavItemClass("general-settings", activeSectionId)}
            onClick={() => setActiveSectionId("general-settings")}
            type="button"
          >
            <SettingsIcon size={16} />
            <span>{t("settings.sectionGeneral")}</span>
          </button>
          <button
            className={settingsNavItemClass("appearance-settings", activeSectionId)}
            onClick={() => setActiveSectionId("appearance-settings")}
            type="button"
          >
            <Palette size={16} />
            <span>{t("settings.sectionAppearance")}</span>
          </button>
          <button
            className={settingsNavItemClass("assistant-settings", activeSectionId)}
            onClick={() => setActiveSectionId("assistant-settings")}
            type="button"
          >
            <Bot size={16} />
            <span>{t("settings.sectionAiAssistant")}</span>
          </button>
          <button
            className={settingsNavItemClass("ssh-settings", activeSectionId)}
            onClick={() => setActiveSectionId("ssh-settings")}
            type="button"
          >
            <Server size={16} />
            <span>{t("settings.sectionSsh")}</span>
          </button>
          <button
            className={settingsNavItemClass("terminal-settings", activeSectionId)}
            onClick={() => setActiveSectionId("terminal-settings")}
            type="button"
          >
            <Terminal size={16} />
            <span>{t("settings.sectionTerminal")}</span>
          </button>
          <button
            className={settingsNavItemClass("screenshot-settings", activeSectionId)}
            onClick={() => setActiveSectionId("screenshot-settings")}
            type="button"
          >
            <Camera size={16} />
            <span>{t("settings.sectionScreenshots")}</span>
          </button>
          <button
            className={settingsNavItemClass("url-settings", activeSectionId)}
            onClick={() => setActiveSectionId("url-settings")}
            type="button"
          >
            <Globe size={16} />
            <span>{t("settings.sectionUrl")}</span>
          </button>
          <button
            className={settingsNavItemClass("rdp-settings", activeSectionId)}
            onClick={() => setActiveSectionId("rdp-settings")}
            type="button"
          >
            <Monitor size={16} />
            <span>{t("settings.sectionRdp")}</span>
          </button>
          <button
            className={settingsNavItemClass("vnc-settings", activeSectionId)}
            onClick={() => setActiveSectionId("vnc-settings")}
            type="button"
          >
            <Network size={16} />
            <span>{t("settings.sectionVnc")}</span>
          </button>
          <button
            className={settingsNavItemClass("about-settings", activeSectionId)}
            onClick={() => setActiveSectionId("about-settings")}
            type="button"
          >
            <Info size={16} />
            <span>{t("settings.sectionAbout")}</span>
          </button>
        </aside>

        <section className="settings-content" aria-label={t("settings.settingsContent")}>
          {activeSectionId === "general-settings" && <GeneralSettings />}
          {activeSectionId === "appearance-settings" && (
            <AppearanceSettings onResetLayout={onResetLayout} />
          )}
          {activeSectionId === "assistant-settings" && <AiSettings />}
          {activeSectionId === "ssh-settings" && <SshSettings />}
          {activeSectionId === "terminal-settings" && <TerminalSettingsPage />}
          {activeSectionId === "screenshot-settings" && <ScreenshotSettings />}
          {activeSectionId === "url-settings" && <UrlSettings />}
          {activeSectionId === "rdp-settings" && <RdpSettings />}
          {activeSectionId === "vnc-settings" && <VncSettings />}
          {activeSectionId === "about-settings" && <AboutSettings />}
        </section>
      </div>
    </main>
  );
}

function settingsNavItemClass(sectionId: SettingsSectionId, activeSectionId: SettingsSectionId) {
  return `settings-nav-item${sectionId === activeSectionId ? " active" : ""}`;
}
