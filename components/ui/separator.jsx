"use client";

import React from "react";

export function Separator({
  className = "",
  orientation = "horizontal",
  ...props
}) {
  const base =
    orientation === "vertical"
      ? "h-full w-px bg-zinc-200"
      : "w-full h-px bg-zinc-200";

  return <div className={`${base} ${className}`} {...props} />;
}
