// src/components/AccuracyChart.jsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function AccuracyChart({ data }) {
  // data is an object { invoice: 0.92, receipt: 0.86 }
  const rows = Object.keys(data || {}).map(k => ({ name: k, accuracy: (data[k] || 0) * 100 }));
  return (
    <div className="p-4 bg-white shadow rounded h-64">
      <h3 className="font-semibold mb-2">Classification Accuracy (%)</h3>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={rows}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="accuracy" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
