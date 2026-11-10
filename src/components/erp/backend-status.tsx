import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { backendConnectionStatus } from "@/backend/transactions.functions";
import { useErp } from "./context";

export function BackendStatus() {
  const { t } = useErp();
  const check = useServerFn(backendConnectionStatus);
  const status = useQuery({
    queryKey: ["backend-connection-status"],
    queryFn: () => check(),
    retry: false,
    staleTime: 30000,
  });
  return (
    <section className="business-panel" aria-label={t("be.title")}>
      <h2>{t("be.title")}</h2>
      <p role="status">
        {status.isPending
          ? t("be.checking")
          : status.isError
            ? t("be.failed")
            : t(`be.${status.data.state}`)}
      </p>
      <p>{t("be.action")}</p>
      <p className="field-hint">{t("be.boundary")}</p>
    </section>
  );
}
