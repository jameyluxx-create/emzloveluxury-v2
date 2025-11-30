"use client";

import React, { createContext, useContext, useState } from "react";

const SelectContext = createContext(null);

export function Select({ value, onValueChange, children }) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(value ?? "");
  const [label, setLabel] = useState("");

  function handleChange(newValue, newLabel) {
    setInternalValue(newValue);
    setLabel(newLabel ?? newValue);
    onValueChange && onValueChange(newValue);
    setOpen(false);
  }

  const ctx = {
    open,
    setOpen,
    value: internalValue,
    label,
    setLabel,
    onValueChange: handleChange,
  };

  return (
    <SelectContext.Provider value={ctx}>
      <div className="relative inline-block w-full">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className = "", children, ...props }) {
  const ctx = useContext(SelectContext);
  return (
    <button
      type="button"
      className={
        "flex h-9 w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm shadow-sm hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 " +
        className
      }
      onClick={() => ctx.setOpen(!ctx.open)}
      {...props}
    >
      {children}
    </button>
  );
}

export function SelectValue({ placeholder }) {
  const ctx = useContext(SelectContext);
  return (
    <span className={ctx.label ? "" : "text-zinc-400"}>
      {ctx.label || placeholder}
    </span>
  );
}

export function SelectContent({ className = "", children }) {
  const ctx = useContext(SelectContext);
  if (!ctx.open) return null;

  return (
    <div
      className={
        "absolute z-50 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg " +
        className
      }
    >
      <div className="max-h-60 overflow-auto py-1">{children}</div>
    </div>
  );
}

export function SelectItem({ value, className = "", children }) {
  const ctx = useContext(SelectContext);

  function handleClick() {
    ctx.onValueChange(value, children);
  }

  const isActive = ctx.value === value;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        "flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-sm hover:bg-zinc-100 " +
        (isActive ? "bg-zinc-100 font-medium " : "") +
        className
      }
    >
      {children}
    </button>
  );
}
