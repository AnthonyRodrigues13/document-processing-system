// src/pages/Dashboard.jsx
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import StatsWidget from "../components/StatsWidget";
import AccuracyChart from "../components/AccuracyChart";
import ExtractedMetrics from "../components/ExtractedMetrics";
import RecentDocs from "../components/RecentDocs";
import useRealtime from "../hooks/useRealtime";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [accuracy, setAccuracy] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [recent, setRecent] = useState([]);

  const fetchAll = useCallback(() => {
    axios.get("http://localhost:5001/api/dashboard/stats").then(r => setStats(r.data)).catch(()=>{});
    axios.get("http://localhost:5001/api/dashboard/accuracy").then(r => setAccuracy(r.data)).catch(()=>{});
    axios.get("http://localhost:5001/api/dashboard/extracted-metrics").then(r => setMetrics(r.data)).catch(()=>{});
    axios.get("http://localhost:5001/api/documents/recent").then(r => setRecent(r.data)).catch(()=>{});
  }, []);

  useEffect(() => fetchAll(), [fetchAll]);

  useRealtime((msg) => {
    if (msg.event === "document_processed") {
      // refresh recent & stats
      fetchAll();
    }
  });

  return (
    <div className="p-4 space-y-6">
      <StatsWidget stats={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AccuracyChart data={accuracy} />
        <ExtractedMetrics metrics={metrics} />
      </div>
      <RecentDocs docs={recent} refresh={fetchAll} />
    </div>
  );
}
