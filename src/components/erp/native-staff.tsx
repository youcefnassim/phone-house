import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNativeCommand } from "./use-native-command";
import { NativeCommandStatus } from "./native-command-status";
import { useErp } from "./context";
import { nativeCompletenessText } from "@/locales/native-completeness";
import { permits } from "@/domain/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativePagination, NATIVE_LIST_PAGE } from "./native-pagination";
export function NativeStaff({ store }: { store: "M01" | "M02" }) {
  const { lang } = useErp(),
    t = nativeCompletenessText(lang),
    command = useNativeCommand();
  const [userId, setUser] = useState(""),
    [role, setRole] = useState("SELLER"),
    [targetStore, setStore] = useState(store);
  const [offset, setOffset] = useState(0);
  const q = useQuery({
    queryKey: ["native-staff", command.repo, store, offset],
    queryFn: () => command.repo.read("/users", store, { limit: NATIVE_LIST_PAGE, offset }),
    retry: false,
  });
  const status = useQuery({
    queryKey: ["native-staff-status", command.repo],
    queryFn: () => command.repo.status(),
    retry: false,
  });
  const allowed = status.data?.memberships?.some((m) =>
    permits(m.role, m.store, store, "account.provision"),
  );
  if (!allowed) return null;
  const rows = q.data?.state === "READY" ? q.data.projection.rows : [];
  const save = (op: "account.provision" | "role.replace" | "account.revoke", id = userId) =>
    command.send(
      op,
      { store, userId: id, ...(op !== "account.revoke" ? { role, targetStore } : {}) },
      async () => {
        const r = await q.refetch();
        if (r.isError) throw r.error;
        setUser("");
      },
    );
  return (
    <section className="grid gap-4">
      <h2>{t.staff}</h2>
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save("account.provision").catch(() => {});
        }}
      >
        <label>
          {t.user}
          <Input
            value={userId}
            required
            disabled={command.locked}
            onChange={(e) => setUser(e.target.value)}
          />
        </label>
        <label>
          {t.role}
          <select value={role} disabled={command.locked} onChange={(e) => setRole(e.target.value)}>
            <option value="SELLER">{t.seller}</option>
            <option value="MANAGER">{t.manager}</option>
          </select>
        </label>
        <label>
          {t.store}
          <select
            value={targetStore}
            disabled={command.locked}
            onChange={(e) => setStore(e.target.value === "M02" ? "M02" : "M01")}
          >
            <option value="M01">Magasin 1 (M01)</option>
            <option value="M02">Magasin 2 (M02)</option>
          </select>
        </label>
        <Button size="lg" disabled={command.locked}>
          {t.add}
        </Button>
        <Button
          size="lg"
          type="button"
          variant="outline"
          disabled={command.locked || !userId}
          onClick={() => void save("role.replace").catch(() => {})}
        >
          {t.activate} / {t.save}
        </Button>
      </form>
      {rows.map((r, i) => (
        <div key={`${r["id"]}:${i}`} className="flex flex-wrap gap-3 border-b border-border py-3">
          <bdi>{String(r["id"])}</bdi>
          <span>
            {r["role"] === "MANAGER" ? t.manager : t.seller} · {String(r["store_id"])} ·{" "}
            {r["active"] ? t.activate : t.retire}
          </span>
          <Button
            size="lg"
            variant="outline"
            disabled={command.locked}
            onClick={() => {
              setUser(String(r["id"]));
              setRole(String(r["role"]));
              setStore(r["store_id"] === "M02" ? "M02" : "M01");
            }}
          >
            {t.role}
          </Button>
          {!!r["active"] && (
            <Button
              size="lg"
              variant="outline"
              disabled={command.locked}
              onClick={() => void save("account.revoke", String(r["id"])).catch(() => {})}
            >
              {t.retire}
            </Button>
          )}
        </div>
      ))}
      <NativeCommandStatus command={command} />
      <NativePagination
        offset={offset}
        hasMore={q.data?.state === "READY" && !!q.data.projection.page?.hasMore}
        busy={q.isFetching || command.locked}
        onChange={setOffset}
      />
    </section>
  );
}
