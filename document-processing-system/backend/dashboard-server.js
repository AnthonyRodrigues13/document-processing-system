// dashboard-server.js
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const WebSocket = require("ws");

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://rodriguesanthon2001_db_user:password@cluster0.eosd7ih.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = process.env.DB_NAME || "document_ai";
const COLLECTION = "processed_documents";

let dbClient, collection;

async function connectMongo() {
  dbClient = new MongoClient(MONGO_URI);
  
  await dbClient.connect();
  collection = dbClient.db(DB_NAME).collection(COLLECTION);
}
connectMongo().catch(err => {
  console.error("Mongo connection failed:", err);
  process.exit(1);
});

// ------- WebSocket server (broadcast helper) -------
const wss = new WebSocket.Server({ port: 6000 });
function broadcast(payload) {
  const s = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(s);
  });
}
console.log("WebSocket server running on ws://localhost:6000");

// Optionally export broadcast to be used by your upload process
module.exports.broadcast = broadcast;

// ---------- Dashboard endpoints ----------

// GET /api/dashboard/stats
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    
    const total = await collection.countDocuments();
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const today = await collection.countDocuments({ uploaded_at: { $gte: todayStart }});
    const classified = await collection.countDocuments({ classification: { $exists: true }});
    const extracted = await collection.countDocuments({ "extracted_data": { $exists: true }});
    const errors = await collection.countDocuments({ warnings: { $exists: true, $ne: [] }});
    res.json({ total, classified, extracted, errors, today });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /api/dashboard/accuracy
app.get("/api/dashboard/accuracy", async (req, res) => {
  try {
    // Example: compute average confidence per document type
    const pipeline = [
      { $match: { classification: { $exists: true }, confidence: { $exists: true } } },
      { $group: { _id: "$classification", avgConf: { $avg: "$confidence" }, count: { $sum: 1 } } }
    ];
    const rows = await collection.aggregate(pipeline).toArray();
    // Convert to { docType: avg } map
    const result = {};
    rows.forEach(r => { result[r._id] = Number(r.avgConf.toFixed(4)); });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch accuracy" });
  }
});

// GET /api/dashboard/extracted-metrics
app.get("/api/dashboard/extracted-metrics", async (req, res) => {
  try {
    // avg, min, max of amounts (assumes extracted_data.amounts array with number field amount)
    const pipeline = [
      { $unwind: "$extracted_data.amounts" },
      { $group: {
          _id: null,
          avg_amount: { $avg: "$extracted_data.amounts.amount" },
          max_amount: { $max: "$extracted_data.amounts.amount" },
          min_amount: { $min: "$extracted_data.amounts.amount" },
        }
      }
    ];
    const summary = (await collection.aggregate(pipeline).toArray())[0] || {};
    // top currencies
    const currencyPipeline = [
      { $unwind: "$extracted_data.amounts" },
      { $group: { _id: "$extracted_data.amounts.currency", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ];
    const currencyRows = await collection.aggregate(currencyPipeline).toArray();
    const currency_count = {};
    currencyRows.forEach(r => { currency_count[r._id || "UNKNOWN"] = r.count; });

    res.json({
      average_amount: summary.avg_amount ? Number(summary.avg_amount.toFixed(2)) : 0,
      max_amount: summary.max_amount || 0,
      min_amount: summary.min_amount || 0,
      currency_count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch extracted metrics" });
  }
});

// GET /api/documents/recent?limit=20&search=&type=&from=&to=
app.get("/api/documents/recent", async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || "20"));
    const search = req.query.search || "";
    const type = req.query.type || "";
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    const filter = {};
    if (search) filter.$text = { $search: search }; // requires text index on fields
    if (type) filter.classification = type;
    if (from || to) filter.uploaded_at = {};
    if (from) filter.uploaded_at.$gte = from;
    if (to) filter.uploaded_at.$lte = to;

    const docs = await collection.find(filter).sort({ uploaded_at: -1 }).limit(limit).toArray();
    // minimal fields
    const out = docs.map(d => ({
      file_name: d.file_name,
      classification: d.classification || null,
      confidence: d.confidence || null,
      uploaded_at: d.uploaded_at,
      warnings: d.warnings || []
    }));
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch recent docs" });
  }
});

// Start dashboard server
const PORT = process.env.DASHBOARD_PORT || 5001;
app.listen(PORT, () => console.log(`Dashboard API running on port ${PORT}`));
