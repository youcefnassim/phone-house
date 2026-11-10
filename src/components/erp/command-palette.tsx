import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  ScanLine,
  LayoutDashboard,
  Smartphone,
  Headphones,
  Wallet,
  ReceiptText,
  BadgeAlert,
  ArrowRightLeft,
  Truck,
  Users,
  Settings,
  Sun,
  Moon,
  Maximize2,
  FileText,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";

export function CommandPalette({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (setControlledOpen ?? (() => {})) : setInternalOpen;

  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, setOpen]);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("ph_theme", isDark ? "dark" : "light");
    } catch {}
    toast.info(isDark ? "Mode sombre activé" : "Mode clair activé");
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      toast.success("Mode plein écran activé");
    } else {
      document.exitFullscreen().catch(() => {});
      toast.info("Mode plein écran désactivé");
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Rechercher un produit, IMEI, client, action... (Ctrl+K)" />
      <CommandList className="max-h-[380px]">
        <CommandEmpty>Aucun résultat trouvé.</CommandEmpty>

        <CommandGroup heading="Actions Rapides">
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/pos" });
                toast.success("Point de vente ouvert");
              })
            }
          >
            <ScanLine className="mr-2 h-4 w-4 text-primary" />
            <span>Ouvrir la Caisse / POS</span>
            <CommandShortcut>F1</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/purchases" });
              })
            }
          >
            <PlusCircle className="mr-2 h-4 w-4 text-amber-500" />
            <span>Achat d'occasion / Enregistrer CIN</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(toggleFullscreen)}>
            <Maximize2 className="mr-2 h-4 w-4 text-teal-500" />
            <span>Basculer le Mode Plein Écran</span>
            <CommandShortcut>F11</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(toggleTheme)}>
            <Sun className="mr-2 h-4 w-4 dark:hidden" />
            <Moon className="mr-2 h-4 w-4 hidden dark:block" />
            <span>Changer de Thème (Clair / Sombre)</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation du Logiciel">
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/" });
              })
            }
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Tableau de bord</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/stock/phones" });
              })
            }
          >
            <Smartphone className="mr-2 h-4 w-4 text-primary" />
            <span>Stock Téléphones (IMEI & Neuf/Occasion)</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/stock/accessories" });
              })
            }
          >
            <Headphones className="mr-2 h-4 w-4 text-violet-500" />
            <span>Stock Accessoires</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/cash" });
              })
            }
          >
            <Wallet className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Caisse & Clôture Journalière</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/sav" });
              })
            }
          >
            <BadgeAlert className="mr-2 h-4 w-4 text-amber-500" />
            <span>SAV & Réparations</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/debts" });
              })
            }
          >
            <FileText className="mr-2 h-4 w-4 text-rose-500" />
            <span>Dettes & Crédits Clients</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/customers" });
              })
            }
          >
            <Users className="mr-2 h-4 w-4" />
            <span>Fiches Clients</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/transfers" });
              })
            }
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            <span>Transferts Inter-Magasins</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/suppliers" });
              })
            }
          >
            <Truck className="mr-2 h-4 w-4" />
            <span>Fournisseurs & Réceptions</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/reports" });
              })
            }
          >
            <ReceiptText className="mr-2 h-4 w-4" />
            <span>Journal des Ventes & Statistiques</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                navigate({ to: "/settings" });
              })
            }
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Paramètres de la Boutique</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

