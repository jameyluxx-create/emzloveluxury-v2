"use client";

import React from "react";

export function Textarea({ className = "", ...props }) {
  const classes =
    "flex min-h-[80px] w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " +
    className;

  return <textarea className={classes} {...props} />;
}
