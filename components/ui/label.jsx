"use client";

import React from "react";

export function Label({ className = "", ...props }) {
  const classes =
    "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 " +
    className;

  return <label className={classes} {...props} />;
}
