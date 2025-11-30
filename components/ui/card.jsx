"use client";

import React from "react";

export function Card({ className = "", ...props }) {
  const classes =
    "rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-sm " +
    className;

  return <div className={classes} {...props} />;
}

export function CardHeader({ className = "", ...props }) {
  const classes =
    "flex flex-col gap-1 p-4 border-b border-zinc-100 " + className;

  return <div className={classes} {...props} />;
}

export function CardTitle({ className = "", ...props }) {
  const classes = "text-base font-semibold leading-tight " + className;

  return <h2 className={classes} {...props} />;
}

export function CardContent({ className = "", ...props }) {
  const classes = "p-4 " + className;

  return <div className={classes} {...props} />;
}
