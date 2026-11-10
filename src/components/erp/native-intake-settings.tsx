import { DocumentSettingsForm } from "./document-settings";
import { useEffect, useState } from "react";
import { type AppSettings } from "@/domain/intake";
import { useDailyNative } from "./use-daily-native";
import { IntakeSettingsForm } from "./fast-intake";
import { useNativeCommand } from "./use-native-command";
import { NativeCommandStatus } from "./native-command-status";

/** Native "Intake" settings: staff read allow-listed keys; settings.save is enforced owner-only by the server. */
export function NativeIntakeSettings({ store, owner }: { store: "M01" | "M02"; owner: boolean }) {
  const { controller } = useDailyNative(store);
  const command = useNativeCommand();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void controller
      .settings()
      .then((s) => active && setSettings(s))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [controller]);
  if (!settings) return failed ? <p role="alert">—</p> : <p role="status">…</p>;
  return (
    <div className="settings-sections mb-6">
      <fieldset disabled={command.locked}>
        <DocumentSettingsForm
          settings={settings}
          canEdit={owner}
          onSave={async (key, value) => {
            await command.send("settings.save", { store, key, value }, async () =>
              setSettings(await controller.settings()),
            );
          }}
        />
        <IntakeSettingsForm
          settings={settings}
          canEdit={owner}
          onSave={async (key, value) => {
            await command.send("settings.save", { store, key, value }, async () =>
              setSettings(await controller.settings()),
            );
          }}
        />
      </fieldset>
      <NativeCommandStatus command={command} />
    </div>
  );
}
