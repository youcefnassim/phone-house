import { useEffect, useState } from "react";
import { useErp } from "./context";

export const originalLogoPath = "/assets/phonehouse-logo-original.png";
/** Only an owner-uploaded PNG at this path is used; no generated substitute. */
export function BrandLogo() {
  const { t } = useErp();
  const [available, setAvailable] = useState("");
  useEffect(() => {
    const image = new Image();
    let mounted = true;
    image.onload = () => {
      if (mounted && image.naturalWidth > 0) setAvailable(image.src);
    };
    image.onerror = () => {
      if (mounted && !image.src.endsWith(".png")) image.src = originalLogoPath;
    };
    image.src = "/assets/phonehouse-logo-original.svg";
    return () => {
      mounted = false;
      image.onload = null;
      image.onerror = null;
    };
  }, []);
  return available ? (
    <img src={available} alt="Phone House" className="official-brand-logo" />
  ) : (
    <>
      <span className="brand-placeholder">PH</span>
      <span className="brand-caption">
        Phone House<small>{t("design.placeholder")}</small>
      </span>
    </>
  );
}
