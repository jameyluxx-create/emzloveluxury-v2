"use client";

import React from "react";

export function Button({ className = "", variant = "default", ...props }) {
  const base =
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none px-4 py-2 border";
  const variants = {
    default:
      "bg-black text-white border-transparent hover:bg-zinc-800 focus-visible:ring-black",
    outline:
      "bg-transparent text-black border-zinc-300 hover:bg-zinc-100 focus-visible:ring-zinc-400",
  };

  const classes = [
    base,
    variants[variant] || variants.default,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} {...props} />;
}
