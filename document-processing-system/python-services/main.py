# app.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

import os
import shutil

from custom_healper import process_document_main, validate_data


# ------------------------------
# Setup
# ------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "backend", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------
# JSON-based /process endpoint
# ------------------------------
class FileRequest(BaseModel):
    filePath: str  # only filename


@app.post("/process")
def process_document(req: FileRequest):
    filename = os.path.basename(req.filePath)
    full_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail=f"File not found: {full_path}")

    result = process_document_main(full_path, "all")
    return result


# ------------------------------
# Helper: Save uploaded file
# ------------------------------
def save_uploaded_file(upload: UploadFile) -> str:
    file_path = os.path.join(UPLOAD_DIR, upload.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return file_path


# ------------------------------
# REST API — Upload & Process
# ------------------------------

# 1 Upload 
@app.post("/api/documents/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_path = save_uploaded_file(file)

        return {
            "fileId": file.filename,
            "originalName": file.filename,
            "result": "uploaded"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 2 Classification Only
@app.post("/api/documents/classify")
async def classify_file(file: UploadFile = File(...)):
    try:
        file_path = save_uploaded_file(file)

        result = process_document_main(file_path, "classify")
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 3 Extracted Data Only
@app.post("/api/documents/extract")
async def extract_file(file: UploadFile = File(...)):
    try:
        file_path = save_uploaded_file(file)

        result = process_document_main(file_path, "extract")
        return {
            "extracted_data": result.get("extracted_data", {}),
            "raw": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 4 Full Pipeline + Validation
@app.post("/api/documents/analyze")
async def analyze_file(file: UploadFile = File(...)):
    try:
        file_path = save_uploaded_file(file)

        result = process_document_main(file_path, "all")

        result["warnings"] = validate_data(result.get("extracted_data", {}))
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
