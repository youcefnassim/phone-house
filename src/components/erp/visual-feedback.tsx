import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { formatMinor } from "@/domain/production-modules";

/** Display-only interpolation; financial values and commands are never changed. */
export function AnimatedAmount({ minor }: { minor: number }) {
  const [shown, setShown] = useState(minor);
  useEffect(() => {
    if (typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const start = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min((Date.now() - start) / 600, 1);
      setShown(Math.round(minor * (1 - (1 - progress) ** 3)));
      if (progress === 1) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [minor]);
  return (
    <bdi className="kpi-number" aria-label={formatMinor(minor)}>
      {formatMinor(shown)}
    </bdi>
  );
}

export function SuccessCheck({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="sale-success">
      <Check aria-hidden="true" />
      {children}
    </p>
  );
}

export function IntakeProgress({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="intake-progress">
      {labels.map((label, i) => (
        <li
          key={label}
          aria-current={current === i ? "step" : undefined}
          data-complete={i < current}
        >
          <span>{i < current ? <Check size={16} aria-hidden="true" /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
