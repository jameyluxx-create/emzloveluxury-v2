"use client";

import React from "react";

export function Badge({ className = "", variant = "default", ...props }) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold";
  const variants = {
    default: "border-transparent bg-zinc-900 text-zinc-50",
    outline: "border-zinc-300 text-zinc-700",
  };

  const classes = [
    base,
    variants[variant] || variants.default,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes} {...props} />;
}
