// src/components/RecentDocs.jsx
import React, { useState } from "react";
import axios from "axios";
import { utils, writeFile } from "xlsx";
import jsPDF from "jspdf";

export default function RecentDocs({ docs = [], refresh }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");

  async function handleSearch() {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (type) q.set("type", type);
    const url = `http://localhost:5001/api/documents/recent?${q.toString()}`;
    const res = await axios.get(url);
    // refresh parent - rely on parent for now: call refresh to reload
    refresh && refresh();
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(docs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "documents.json"; a.click();
  }

  function exportCSV() {
    const ws = utils.json_to_sheet(docs);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Documents");
    writeFile(wb, "documents.xlsx");
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.text("Recent Documents", 10, 10);
    docs.slice(0, 20).forEach((d, i) => {
      doc.text(`${i+1}. ${d.file_name} - ${d.classification || "-"}`, 10, 20 + i*6);
    });
    doc.save("documents.pdf");
  }

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex flex-col md:flex-row gap-2 md:items-end md:justify-between">
        <div className="flex gap-2">
          <input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} className="border p-2 rounded" />
          <input placeholder="Type" value={type} onChange={e => setType(e.target.value)} className="border p-2 rounded" />
          <button onClick={handleSearch} className="px-3 py-2 bg-blue-600 text-white rounded">Filter</button>
        </div>
        <div className="flex gap-2">
          <button onClick={exportJSON} className="px-3 py-2 border rounded">Export JSON</button>
          <button onClick={exportCSV} className="px-3 py-2 border rounded">Export XLSX</button>
          <button onClick={exportPDF} className="px-3 py-2 border rounded">Export PDF</button>
        </div>
      </div>

      <table className="w-full mt-4 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">File</th>
            <th>Type</th>
            <th>Confidence</th>
            <th>Warnings</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{d.file_name}</td>
              <td>{d.classification || "-"}</td>
              <td>{d.confidence ? (d.confidence*100).toFixed(1) + "%" : "-"}</td>
              <td>{d.warnings?.length ? d.warnings.join(", ") : "-"}</td>
              <td>{new Date(d.uploaded_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
