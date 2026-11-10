import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Three levels only (ERP visual style 2026-11-10): primary, secondary, tertiary.
// default = primary; outline/secondary/destructive = secondary; ghost/link = tertiary (no box).
const buttonVariants = cva(
  "ph-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "ph-btn-primary bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "ph-btn-secondary border border-foreground bg-card text-destructive hover:bg-muted",
        outline: "ph-btn-secondary border border-foreground bg-card text-foreground hover:bg-muted",
        secondary:
          "ph-btn-secondary border border-foreground bg-card text-foreground hover:bg-muted",
        ghost: "ph-btn-tertiary bg-transparent text-foreground hover:bg-muted",
        link: "ph-btn-tertiary bg-transparent text-primary underline underline-offset-4",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        sm: "min-h-11 px-3",
        lg: "min-h-13 px-6",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
