import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** 通用状态徽标：labels/tones 由调用方传入 */
export function StatusBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone?: "default" | "blue" | "green" | "orange" | "red" | "outline";
  className?: string;
}) {
  return (
    <Badge variant={tone ?? "default"} className={cn(className)}>
      {label}
    </Badge>
  );
}
