import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-zinc-100 text-zinc-700",
        blue: "bg-blue-50 text-blue-700",
        green: "bg-emerald-50 text-emerald-700",
        orange: "bg-orange-50 text-orange-700",
        red: "bg-red-50 text-red-700",
        outline: "border border-zinc-200 text-zinc-600",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

/** 优先级徽标：P0 红 / P1 橙 / P2 蓝 / P3 灰 */
export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { variant: "red" | "orange" | "blue" | "default"; label: string }> = {
    P0: { variant: "red", label: "P0" },
    P1: { variant: "orange", label: "P1" },
    P2: { variant: "blue", label: "P2" },
    P3: { variant: "default", label: "P3" },
  };
  const m = map[priority] ?? map.P3;
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export { badgeVariants };
