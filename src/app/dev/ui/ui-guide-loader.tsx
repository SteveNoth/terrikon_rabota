"use client";

import dynamic from "next/dynamic";

export const UiGuideLoader = dynamic(
  () => import("./ui-guide").then((mod) => mod.UiGuide),
  {
    ssr: false,
    loading: () => (
      <p className="p-4 text-muted">Загружаем стайлгайд…</p>
    ),
  },
);
