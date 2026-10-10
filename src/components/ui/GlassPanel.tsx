import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function GlassPanel({ className, strong, ...rest }: HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return <div className={cn(strong ? "glass-strong" : "glass", "rounded-glass-lg", className)} {...rest} />;
}
