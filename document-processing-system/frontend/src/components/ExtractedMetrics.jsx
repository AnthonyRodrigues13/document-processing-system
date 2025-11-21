// src/components/ExtractedMetrics.jsx
import React from "react";

export default function ExtractedMetrics({ metrics }) {
  if (!metrics) return <div className="p-4">Loading metrics...</div>;
  return (
    <div className="p-4 bg-white shadow rounded">
      <h3 className="font-semibold mb-2">Extracted Data Metrics</h3>
      <div>Average Amount: {metrics.average_amount}</div>
      <div>Max Amount: {metrics.max_amount}</div>
      <div>Min Amount: {metrics.min_amount}</div>
      <div className="mt-2">
        <strong>Currency counts:</strong>
        <ul className="list-disc pl-5">
          {Object.entries(metrics.currency_count || {}).map(([k,v]) => (
            <li key={k}>{k}: {v}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
