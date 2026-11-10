import { useState } from "react";
import { useErp } from "./context";

export const originalLogoPath = "/assets/phonehouse-logo-original.png";
/** Only an owner-uploaded PNG at this path is used; no generated substitute. */
export function BrandLogo() {
  const { t } = useErp();
  const [failed, setFailed] = useState(false);

  return !failed ? (
    <img
      src={originalLogoPath}
      alt="Phone House Maghnia"
      className="official-brand-logo"
      onError={() => setFailed(true)}
    />
  ) : (
    <>
      <span className="brand-placeholder">PH</span>
      <span className="brand-caption">
        Phone House<small>{t("design.placeholder")}</small>
      </span>
    </>
  );
}
