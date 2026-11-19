"use client";

import React, { useState } from "react";
import { HelpCircle } from "lucide-react";

interface TooltipBadgeProps {
  title: string;
  content: string;
  align?: "left" | "right" | "center";
}

export default function TooltipBadge({ title, content, align = "left" }: TooltipBadgeProps) {
  const [open, setOpen] = useState(false);

  const alignClass =
    align === "right"
      ? "right-0"
      : align === "center"
      ? "left-1/2 -translate-x-1/2"
      : "left-0";

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Ayuda: ${title}`}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-cyan-400 focus:outline-none transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          className={`absolute bottom-full mb-2 ${alignClass} z-50 w-64 p-3 rounded-lg shadow-xl border text-left pointer-events-none bg-slate-900 text-slate-100 border-slate-700 dark:bg-slate-950 dark:border-slate-700`}
        >
          <div className="text-[11px] font-bold text-cyan-400 mb-1">{title}</div>
          <p className="text-[11px] leading-relaxed text-slate-300">{content}</p>
        </div>
      )}
    </span>
  );
}
