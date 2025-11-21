// ==============================================
// IMPORTS
// ==============================================
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

// WebSocket broadcast server
const { broadcast } = require("./dashboard-server");

const app = express();
app.use(cors());
app.use(express.json());

// ==============================================
// MULTER STORAGE (HASHED FILES)
// ==============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),

    filename: (req, file, cb) => {
        const hash = crypto.randomBytes(8).toString("hex");
        cb(null, `${hash}_${file.originalname}`);
    }
});

const upload = multer({ storage });

// ==============================================
// MONGO DB CONNECTION
// ==============================================
const mongoClient = new MongoClient(
    "mongodb+srv://rodriguesanthon2001_db_user:password@cluster0.eosd7ih.mongodb.net/?appName=Cluster0"
);

async function getCollection() {
    if (!mongoClient._mongoClientTopology || !mongoClient.topology) {
        await mongoClient.connect();
    }

    return mongoClient.db("document_ai").collection("processed_documents");
}


// ==============================================
// UPLOAD + PYTHON PROCESS
// ==============================================
app.post("/api/documents/upload", upload.single("file"), async (req, res) => {
    try {
        const fileName = req.file.filename; // saved locally

        // Call Python OCR/ML pipeline
        const response = await axios.post(
            "http://localhost:8000/process",
            { filePath: fileName },
            { headers: { "Content-Type": "application/json" } }
        );

        const result = response.data;

        // Save into MongoDB
        const collection = await getCollection();
        const doc = {
            file_name: fileName,
            uploaded_at: new Date(),
            ...result
        };

        const saveResult = await collection.insertOne(doc);

        // Broadcast WebSocket event
        broadcast({
            event: "document_processed",
            fileId: saveResult.insertedId,
            classification: result.classification,
            confidence: result.confidence
        });

        res.json({
            message: "Document processed successfully",
            data: result
        });

    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Document processing failed" });
    }
});


// ==============================================
// DASHBOARD ROUTES
// ==============================================

app.get("/api/dashboard/stats", async (req, res) => {
    try {
        const collection = await getCollection();

        const stats = await collection.aggregate([
            {
                $group: {
                    _id: null,
                    total_docs: { $sum: 1 },
                    avg_confidence: { $avg: "$confidence" },
                    invoices: { $sum: { $cond: [{ $eq: ["$classification", "invoice"] }, 1, 0] } },
                    receipts: { $sum: { $cond: [{ $eq: ["$classification", "receipt"] }, 1, 0] } },
                    contracts: { $sum: { $cond: [{ $eq: ["$classification", "contract"] }, 1, 0] } }
                }
            }
        ]).toArray();

        res.json(stats[0] || {});
    } catch (err) {
        res.status(500).json({ error: "Failed to load stats" });
    }
});


app.get("/api/dashboard/accuracy", async (req, res) => {
    try {
        const collection = await getCollection();

        const data = await collection
            .find({}, { projection: { confidence: 1, uploaded_at: 1 } })
            .sort({ uploaded_at: -1 })
            .limit(30)
            .toArray();

        const formatted = data.map(d => ({
            date: d.uploaded_at.toISOString().slice(0, 10),
            accuracy: Math.round((d.confidence || 0) * 100) / 100
        }));

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: "Failed to load accuracy trend" });
    }
});


app.get("/api/dashboard/extracted-metrics", async (req, res) => {
    try {
        const collection = await getCollection();

        const metrics = await collection.aggregate([
            {
                $group: {
                    _id: null,
                    total_dates: { $sum: { $size: { $ifNull: ["$extracted_data.dates", []] } } },
                    total_amounts: { $sum: { $size: { $ifNull: ["$extracted_data.amounts", []] } } },
                    total_companies: { 
                        $sum: { 
                            $cond: [
                                { $ifNull: ["$extracted_data.company", false] },
                                1, 
                                0
                            ] 
                        }
                    }
                }
            }
        ]).toArray();

        res.json(metrics[0] || {});
    } catch (err) {
        res.status(500).json({ error: "Failed to load metrics" });
    }
});


app.get("/api/documents/recent", async (req, res) => {
    try {
        const collection = await getCollection();

        const docs = await collection
            .find({})
            .sort({ uploaded_at: -1 })
            .limit(10)
            .toArray();

        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: "Failed to load recent docs" });
    }
});


// ==============================================
// START SERVER
// ==============================================
app.listen(5000, () => {
    console.log("Node API running on port 5000");
});

