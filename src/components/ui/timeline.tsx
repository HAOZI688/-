import * as React from "react";
import { cn } from "@/lib/utils";

export function Timeline({
  items,
  className,
}: {
  items: { time?: string; title: string; content?: React.ReactNode; tone?: "default" | "blue" | "green" | "orange" | "red" }[];
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-4 border-l border-zinc-200 pl-4", className)}>
      {items.map((item, i) => (
        <li key={i} className="relative">
          <span
            className={cn(
              "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white",
              item.tone === "green" && "bg-emerald-500",
              item.tone === "blue" && "bg-blue-500",
              item.tone === "orange" && "bg-orange-500",
              item.tone === "red" && "bg-red-500",
              (!item.tone || item.tone === "default") && "bg-zinc-300",
            )}
          />
          <div className="text-xs">
            {item.time && <span className="mr-2 font-mono text-zinc-400">{item.time}</span>}
            <span className="font-medium text-zinc-800">{item.title}</span>
          </div>
          {item.content && <div className="mt-1 text-xs text-zinc-500">{item.content}</div>}
        </li>
      ))}
    </ol>
  );
}
