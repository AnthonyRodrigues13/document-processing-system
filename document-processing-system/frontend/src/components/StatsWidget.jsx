// src/components/StatsWidget.jsx
import React from "react";

export default function StatsWidget({ stats }) {
  if (!stats) return <div className="p-4">Loading stats...</div>;

  const items = [
    { title: "Total", value: stats.total },
    { title: "Classified", value: stats.classified },
    { title: "Extracted", value: stats.extracted },
    { title: "Errors", value: stats.errors },
    { title: "Today", value: stats.today },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {items.map(i => (
        <div key={i.title} className="p-4 bg-white shadow rounded">
          <div className="text-sm text-gray-500">{i.title}</div>
          <div className="text-2xl font-bold">{i.value ?? 0}</div>
        </div>
      ))}
    </div>
  );
}
