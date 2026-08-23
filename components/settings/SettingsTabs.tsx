"use client";

import { useState } from "react";

export type SettingsSection = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export function SettingsTabs({ sections }: { sections: SettingsSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 rounded-lg border p-1 overflow-x-auto w-fit max-w-full">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveId(section.id)}
            className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
              section.id === active?.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>
      <div className="max-w-5xl">{active?.content}</div>
    </div>
  );
}
