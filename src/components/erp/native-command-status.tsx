import { Button } from "@/components/ui/button";
import { nativeDailyError } from "@/locales/native-daily";
import { nativeCompletenessText } from "@/locales/native-completeness";
import { useErp } from "./context";
import type { useNativeCommand } from "./use-native-command";
export function NativeCommandStatus({ command }: { command: ReturnType<typeof useNativeCommand> }) {
  const { lang } = useErp(),
    t = nativeCompletenessText(lang);
  if (command.state === "IDLE") return null;
  return (
    <div
      role={command.state === "BUSY" ? "status" : "alert"}
      className="flex flex-wrap items-center gap-3 py-3"
    >
      <p>
        {command.state === "BUSY"
          ? t.loading
          : command.state === "UNKNOWN"
            ? t.pending
            : nativeDailyError(lang, command.error)}
      </p>
      {command.key && command.state === "UNKNOWN" && (
        <code className="break-all">{command.key}</code>
      )}
      {command.state === "UNKNOWN" && (
        <Button size="lg" onClick={() => void command.check().catch(() => {})}>
          {t.check}
        </Button>
      )}
      {command.state === "NOT_RECORDED" && (
        <Button size="lg" onClick={() => void command.retry().catch(() => {})}>
          {t.retry}
        </Button>
      )}
      {(command.state === "ERROR" || command.state === "NOT_RECORDED") && (
        <Button size="lg" variant="outline" onClick={command.cancel}>
          {t.cancel}
        </Button>
      )}
    </div>
  );
}
