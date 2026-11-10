import { permits, roleOperations } from "@/domain/permissions";
import { DT } from "./shared";
import { displayText } from "@/locales/display";
import { useState } from "react";
import { ShieldAlert, UserPlus, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useTestWorkspace,
  workspaceIdentities,
  reviewActor,
  saveReviewStaff,
} from "@/data/test-workspace";
import { storeLabel } from "@/domain/erp";
import { useSession } from "@/data/session-store";
import { OperationDialog, OperationDraftForm, type DraftField } from "./operation-ui";
import { z } from "zod";
import { useT, useErp } from "./context";
import { displayName } from "@/locales/display";

// Users & roles. Identity, store membership and role assignment are shown as
// separate concepts (matching the future user_roles design). Invitations are
// session drafts only — no account, credential or access grant is created.

const matrix: [string, string, string][] = Object.entries(roleOperations).map(
  ([role, operations]) => [
    role,
    role === "SUPER_ADMIN" ? "M01 + M02" : "Assigned store only",
    operations.join(", "),
  ],
);

const invitationSchema = z.object({
  name: z.string().trim().min(1, "Required"),
  identityId: z.string().optional(),
  store: z.enum(["M01", "M02"]),
  role: z.enum(["MANAGER", "SELLER"]),
});
const invitationFieldsFor = (__t: (k: string) => string): DraftField[] => [
  { name: "name", label: __t("users.display_name_bc9e") },

  { name: "store", label: __t("users.store_membership_bf51"), options: ["M01", "M02"] },
  {
    name: "role",
    label: __t("users.proposed_role_c461"),
    options: ["SELLER", "MANAGER"],
    hint: __t("users.role_assignment_stays_separate_f_9eee"),
  },
];

export function UsersPage() {
  const __t = useT();
  const __lang = useErp().lang;
  const ws = useTestWorkspace();
  const identities = workspaceIdentities(ws);
  const demoUsers = identities.filter(
    (u) => u.active && (ws.fixturePolicy !== "empty" || ws.staff?.some((x) => x.id === u.id)),
  );
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const session = useSession();
  const invitations = session.audit.filter((e) => e.area === "users");
  return (
    <div className="page-enter module-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{__t("users.access_administration_dd9c")}</div>
          <h1>
            {__t("users.users_roles_5a61")}
            <span className="heading-dot">.</span>
          </h1>
          <p>{__t("users.demo_data_no_authentication_conn_1371")}</p>
        </div>
        <div className="heading-actions">
          <Button
            disabled={!permits(reviewActor(ws)?.role ?? "", "GLOBAL", "M01", "account.provision")}
            onClick={() => setOpen(true)}
          >
            <UserPlus />
            {__t("staff.addActivate")}
          </Button>
        </div>
      </div>
      <div className="safety-notice">
        <ShieldAlert size={17} />
        {__t("users.role_previews_are_unauthenticate_5bb3")}
      </div>
      <div className="module-stats">
        <div>
          <span>{__t("users.demo_users_d145")}</span>
          <strong>{demoUsers.length}</strong>
        </div>
        <div>
          <span>{__t("users.roles_a5cd")}</span>
          <strong>3</strong>
        </div>
        <div>
          <span>{__t("users.invitation_drafts_a310")}</span>
          <strong>{invitations.length}</strong>
        </div>
        <div>
          <span>{__t("users.authentication_c75f")}</span>
          <strong className="stat-text">{__t("users.not_connected_7b27")}</strong>
        </div>
      </div>
      <h2 className="operation-section-title">{__t("users.identities_a93f")}</h2>
      <div className="table-scroll">
        <table className="data-table business-table">
          <thead>
            <tr>
              <th>{__t("users.identities_a93f")}</th>
              <th>{__t("users.state_2b84")}</th>
            </tr>
          </thead>
          <tbody>
            {demoUsers.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{displayName(__lang, u.name)}</strong>
                  <small>{u.id}</small>
                </td>
                <td>
                  <small>{displayText(__lang, "Synthetic fixture · Not a real account")}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="retail-details">
        <summary>{__t("staff.history")}</summary>
        <ul>
          {identities
            .filter((u) => !u.active)
            .map((u) => (
              <li key={u.id}>
                {displayName(__lang, u.name)} · {__t("staff.retired")}
                <small>
                  <bdi>{u.id}</bdi>
                </small>
              </li>
            ))}
        </ul>
      </details>
      <h2 className="operation-section-title">{__t("users.store_memberships_8cb1")}</h2>
      <div className="table-scroll">
        <table className="data-table business-table">
          <thead>
            <tr>
              <th>{__t("users.identities_a93f")}</th>
              <th>{__t("users.store_3cfb")}</th>
            </tr>
          </thead>
          <tbody>
            {demoUsers.flatMap((u) =>
              u.stores.map((s) => (
                <tr key={`${u.id}-${s}`}>
                  <td>
                    {displayName(__lang, u.name)}
                    <small>{u.id}</small>
                  </td>
                  <td>{storeLabel(s)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <h2 className="operation-section-title">
        {__t("users.role_assignments_separate_from_i_4fb8")}
      </h2>
      <div className="table-scroll">
        <table className="data-table business-table">
          <thead>
            <tr>
              <th>{__t("users.identities_a93f")}</th>
              <th>{__t("users.roles_a5cd")}</th>
              <th>{__t("users.basis_ecd9")}</th>
            </tr>
          </thead>
          <tbody>
            {demoUsers.map((u) => (
              <tr key={u.id}>
                <td>
                  {displayName(__lang, u.name)}
                  <small>{u.id}</small>
                </td>
                <td>
                  <DT text={u.role} />
                </td>
                <td>
                  <small>{__t("users.separate_assignment_record_revoc_1f54")}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="operation-section-title">{__t("users.authorization_matrix_proposed_0d35")}</h2>
      <div className="table-scroll">
        <table className="data-table business-table">
          <thead>
            <tr>
              <th>{__t("users.roles_a5cd")}</th>
              <th>{__t("users.scope_370a")}</th>
              <th>{__t("users.proposed_capabilities_3d73")}</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map(([role, scopeRow, caps]) => (
              <tr key={role}>
                <td>
                  <strong>
                    <DT text={role} />
                  </strong>
                </td>
                <td>
                  <DT text={scopeRow} />
                </td>
                <td>
                  <small>
                    <DT text={caps} />
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notice && (
        <p role="status" className="session-notice">
          {notice}
        </p>
      )}
      <OperationDialog open={open} onClose={() => setOpen(false)} title={__t("staff.addActivate")}>
        <OperationDraftForm
          title={__t("users.invitation_0ba0")}
          schema={invitationSchema}
          fields={[
            {
              name: "identityId",
              label: __t("staff.existing"),
              options: ["", ...identities.filter((u) => u.role !== "SUPER_ADMIN").map((u) => u.id)],
            },
            ...invitationFieldsFor(__t),
          ]}
          defaults={{ store: "M01", role: "SELLER", identityId: "" }}
          onCancel={() => setOpen(false)}
          onSave={(v) => {
            saveReviewStaff({
              name: v.name,
              role: v.role,
              store: v.store,
              ...(v.identityId ? { id: v.identityId } : {}),
            });
            setOpen(false);
            setNotice(__t("staff.saved"));
          }}
        />
      </OperationDialog>
      <p className="session-notice">
        <LockKeyhole size={14} /> {__t("users.owner_purchase_costs_and_confide_d30d")}
      </p>
    </div>
  );
}
