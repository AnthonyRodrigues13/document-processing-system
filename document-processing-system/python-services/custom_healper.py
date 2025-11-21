import os
import re
import tempfile
from pdf2image import convert_from_path
from PIL import Image
import pytesseract
import docx
from transformers import pipeline
from dateutil import parser
import datetime
from pymongo import MongoClient
import certifi
AMOUNT_REGEX = r"(₹|\$|USD|INR)?\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)"

KEYWORDS = ["total", "amount", "invoice", "subtotal", "balance", "paid", "due"]

DATE_REGEX = r"\b(\d{1,2}[\/\-\.\s]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[\/\-\.\s]?\d{2,4})\b|\b(\d{4}[\/\-\.\s]\d{1,2}[\/\-\.\s]\d{1,2})\b"
COMPANY_KEYWORDS = [" Pvt Ltd", " Private Limited", " LLC", " Inc", " Ltd", " LLP", " GmbH"]
PATTERNS = {
    "PAN": r"\b[A-Z]{5}[0-9]{4}[A-Z]\b",
    "GST": r"\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d\b",
    "EIN": r"\b\d{2}\-\d{7}\b",
}
CLAUSE_KEYWORDS = {
    "termination": ["termination", "terminate", "end of agreement"],
    "payment": ["payment terms", "fees", "billing"],
    "confidentiality": ["confidential", "non-disclosure", "nda"],
    "liability": ["liability", "indemnify", "indemnification"],
}

def extract_dates(text):
    patterns = [
        r'\b\d{1,2}-[A-Za-z]{3}-\d{4}\b',        # 14-Nov-2025
        r'\b\d{4}-\d{2}-\d{2}\b',                # 2025-11-14
        r'\b\d{1,2}/\d{1,2}/\d{2,4}\b',          # 14/11/2025
        r'\b[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}\b'  # Nov 14, 2025
    ]

    dates = []
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for m in matches:
            dates.append(m)

    return dates



def extract_amounts(text: str):
    matches = re.finditer(AMOUNT_REGEX, text)
    results = []

    for m in matches:
        symbol, value = m.group(1), m.group(2)

        # Clean numeric value
        amount_val = float(value.replace(",", ""))

        # If currency symbol exists → keep it
        if symbol:
            results.append({"currency": symbol, "amount": amount_val})
            continue

        # Check proximity for keywords (avoid years)
        before = text[max(0, m.start()-20):m.start()].lower()
        after = text[m.end():m.end()+20].lower()

        if any(kw in before or kw in after for kw in KEYWORDS):
            results.append({"currency": symbol, "amount": amount_val})
            continue
        continue

    return results






def extract_company(text: str):
    lines = text.split("\n")
    candidates = []

    for line in lines:
        for kw in COMPANY_KEYWORDS:
            if kw.lower() in line.lower():
                candidates.append(line.strip())
    
    if candidates:
        return list(set(candidates))
    
    return None




def extract_tax_id(text: str):
    results = {}
    for name, pattern in PATTERNS.items():
        matches = re.findall(pattern, text)
        if matches:
            results[name] = list(set(matches))

    return results



def extract_contract_clauses(text: str):
    text_lower = text.lower()
    found = {}

    for clause, keywords in CLAUSE_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                if clause not in found:
                    found[clause] = []
                found[clause].append(kw)

    return found


RULES = [
    {
        "id": "missing_invoice_amount",
        "description": "Invoices must contain at least one valid monetary amount.",
        "severity": "high",
        "applies_to": ["invoice document"],
        "check": lambda doc: len(doc["amounts"]) == 0,
        "remediation": "Check OCR quality or ask user to upload a clearer invoice."
    },

    {
        "id": "missing_contract_clause",
        "description": "Legal contracts usually require key clauses.",
        "severity": "medium",
        "applies_to": ["legal contract"],
        "check": lambda doc: len(doc["clauses"].get("termination", [])) == 0
                            or len(doc["clauses"].get("confidentiality", [])) == 0,
        "remediation": "Verify that termination/confidentiality clauses are present."
    },

    {
        "id": "missing_tax_id",
        "description": "Tax documents must contain GST/PAN or other identifiers.",
        "severity": "high",
        "applies_to": ["tax document"],
        "check": lambda doc: len(doc["tax_ids"].get("GST", [])) == 0 and
                             len(doc["tax_ids"].get("PAN", [])) == 0,
        "remediation": "Ensure the document contains valid GST or PAN numbers."
    },

    {
        "id": "no_date_found",
        "description": "Documents must contain at least one date.",
        "severity": "low",
        "applies_to": [
            "invoice document",
            "legal contract",
            "tax document",
            "general correspondence"
        ],
        "check": lambda doc: len(doc["dates"]) == 0,
        "remediation": "Check OCR quality or confirm if the document is undated."
    }
]

def run_compliance_rules(extracted_data, classification):
    triggered_rules = []
    for rule in RULES:
        if classification not in rule["applies_to"]:
            continue
        try:
            if rule["check"](extracted_data):
                triggered_rules.append({
                    "id": rule["id"],
                    "description": rule["description"],
                    "severity": rule["severity"],
                    "remediation": rule["remediation"]
                })
        except:
            continue
    return triggered_rules



# ------------------------------------------------
# 1 FILE TYPE HANDLER
# ------------------------------------------------
def extract_text_from_file(file_path):
    extension = os.path.splitext(file_path)[1].lower()

    if extension == ".pdf":
        return process_pdf(file_path)

    elif extension in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]:
        return process_image(file_path)

    elif extension == ".docx":
        return process_docx(file_path)

    else:
        return None, "unsupported file type"


# ------------------------------------------------
# 2 PDF PROCESSING
# ------------------------------------------------
def process_pdf(pdf_path):
    from PyPDF2 import PdfReader

    reader = PdfReader(pdf_path)
    text = ""

    # Check if PDF has extractable text
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted

    if text.strip():  
        return text, None   # Direct text extraction success

    # Otherwise scanned PDF → convert pages to image → OCR
    images = convert_from_path(pdf_path)
    ocr_text = ""

    for img in images:
        processed = preprocess_image(img)
        ocr_text += pytesseract.image_to_string(processed)

    return clean_text(ocr_text), None


# ------------------------------------------------
# 3 IMAGE PROCESSING
# ------------------------------------------------
def process_image(image_path):
    img = Image.open(image_path)
    processed = preprocess_image(img)
    text = pytesseract.image_to_string(processed)
    return clean_text(text), None


# Optimize image
def preprocess_image(img):
    img = img.convert("L")                    # grayscale
    img = img.resize((img.width * 2, img.height * 2))  # upscale for better OCR
    return img


# ------------------------------------------------
# 4 DOCX PROCESSING
# ------------------------------------------------
def process_docx(doc_path):
    document = docx.Document(doc_path)
    text = "\n".join([para.text for para in document.paragraphs])
    return clean_text(text), None


# ------------------------------------------------
# TEXT CLEANING
# ------------------------------------------------
def clean_text(text):
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ------------------------------------------------
# 5 DOCUMENT CLASSIFICATION
# ------------------------------------------------
LABELS = [
    "invoice document",
    "legal contract",
    "tax document",
    "general correspondence"
]

classifier = pipeline(
    "zero-shot-classification",
    model="facebook/bart-large-mnli"
)

def classify_document(text):
    result = classifier(text[:1500], LABELS)
    label = result["labels"][0]
    confidence = float(result["scores"][0])
    return label, confidence

# ------------------------------------------------
# 6 NLP STRUCTURED EXTRACTION
# ------------------------------------------------
def extract_structured_data(text):
    return {
        "dates": extract_dates(text),              # list of "YYYY-MM-DD"
        "amounts": extract_amounts(text),          # list of {currency, amount}
        "companies": extract_company(text),        # list or None
        "tax_ids": extract_tax_id(text),           # dict: {"GST": [...], "PAN": [...]}
        "clauses": extract_contract_clauses(text)  # dict
    }



# ------------------------------------------------
# 7 VALIDATION
# ------------------------------------------------
def validate_data(data):
    warnings = []

    # -------------------
    # Validate DATES
    # -------------------
    if data["dates"]:
        for d in data["dates"]:
            if not re.match(r"\d{4}-\d{2}-\d{2}", d):
                warnings.append(f"Invalid date format: {d}")

    # -------------------
    # Validate AMOUNTS
    # -------------------
    if data["amounts"]:
        for entry in data["amounts"]:
            if "amount" not in entry:
                warnings.append("Amount missing numeric value")
            elif not isinstance(entry["amount"], (int, float)):
                warnings.append(f"Amount not numeric: {entry}")

    # -------------------
    # Validate TAX IDs
    # -------------------
    if data["tax_ids"]:
        for tax_type, values in data["tax_ids"].items():
            for v in values:
                pattern = PATTERNS[tax_type]
                if not re.match(pattern, v):
                    warnings.append(f"Invalid {tax_type}: {v}")

    # -------------------
    # Validate COMPANIES
    # -------------------
    if data["companies"]:
        for c in data["companies"]:
            if len(c) < 3:
                warnings.append(f"Suspicious company name: {c}")

    return warnings


client = MongoClient(
    "mongodb+srv://rodriguesanthon2001_db_user:password@cluster0.eosd7ih.mongodb.net/?retryWrites=true&w=majority&tls=true",
    tlsCAFile=certifi.where()
)

# client = MongoClient("mongodb+srv://rodriguesanthon2001_db_user:password@cluster0.eosd7ih.mongodb.net/?appName=Cluster0")
# client = MongoClient("mongodb+srv://rodriguesanthon2001_db_user:password@cluster0.eosd7ih.mongodb.net/?appName=Cluster0")
db = client["document_ai"]
collection = db["processed_documents"]

def save_to_mongo(result, file_path):
    doc = {
        "file_name": file_path.split("\\")[-1],
        "uploaded_at": datetime.datetime.utcnow(),
        **result
    }
    collection.insert_one(doc)


# ------------------------------------------------
# 8 MASTER FUNCTION
# ------------------------------------------------
def process_document_main(file_path,action='all'):
    raw_text, error = extract_text_from_file(file_path)
    if error:
        return {"error": error}
    # Classification
    doc_type, confidence = classify_document(raw_text)
    if action == 'classify':
        result = {
            "classification": doc_type,
            "confidence": confidence,
        }
        return result

    # Extraction
    extracted_data = extract_structured_data(raw_text)
    if action == 'extract':
        result = {
            "raw_text": raw_text,
            "extracted_data": extracted_data,
        }
        return result

    # Validation
    warnings = validate_data(extracted_data)
    # Compliance checks depend on extracted_data and doc_type
    rules_triggered = run_compliance_rules(extracted_data, doc_type)

    result = {
        "classification": doc_type,
        "confidence": confidence,
        "raw_text": raw_text,
        "extracted_data": extracted_data,
        "warnings": warnings,
        "compliance": rules_triggered,
    }
    save_to_mongo(result, file_path)

    return result


# ------------------------------------------------
# RUN TEST
# ------------------------------------------------
# if __name__ == "__main__":
#     file_path = "C:\\Users\\rodri\\Downloads\\sample_document.pdf"  # change this for testing
#     result = process_document_main(file_path)
#     print(result)
