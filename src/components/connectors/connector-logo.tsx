import React from "react";
import { cn } from "@/lib/utils";
import type { ConnectorDef } from "@/lib/connectors-data";

interface ConnectorLogoProps {
  connector: Pick<ConnectorDef, "name" | "abbr" | "color" | "textColor">;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-base",
};

export function ConnectorLogo({ connector, size = "md", className }: ConnectorLogoProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-bold leading-none shadow-sm",
        sizes[size],
        className
      )}
      style={{
        backgroundColor: connector.color,
        color: connector.textColor ?? "#ffffff",
      }}
    >
      {connector.abbr}
    </div>
  );
}
