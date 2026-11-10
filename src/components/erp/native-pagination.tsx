import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./ui-context";
import { nativeDailyText } from "@/locales/native-daily";
export const NATIVE_LIST_PAGE = 100;
export function NativePagination({
  offset,
  hasMore,
  busy,
  onChange,
}: {
  offset: number;
  hasMore: boolean;
  busy: boolean;
  onChange: (offset: number) => void;
}) {
  const { lang } = useErp();
  return (
    <nav className="native-pagination" aria-label={nativeDailyText(lang, "next")}>
      <Button
        variant="outline"
        disabled={busy || offset === 0}
        onClick={() => onChange(Math.max(0, offset - NATIVE_LIST_PAGE))}
        aria-label={nativeDailyText(lang, "previous")}
      >
        <ChevronLeft />
      </Button>
      <bdi>{Math.floor(offset / NATIVE_LIST_PAGE) + 1}</bdi>
      <Button
        variant="outline"
        disabled={busy || !hasMore}
        onClick={() => onChange(offset + NATIVE_LIST_PAGE)}
        aria-label={nativeDailyText(lang, "next")}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}
