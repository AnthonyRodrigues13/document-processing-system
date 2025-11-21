import React, { useState } from "react";
import Tesseract from "tesseract.js";

export default function ClientOCR() {
  const [image, setImage] = useState(null);
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);

  const handleFileChange = (e) => {
    setImage(URL.createObjectURL(e.target.files[0]));
  };

  const runOCR = async () => {
    if (!image) return;

    setProcessing(true);
    setText("");

    Tesseract.recognize(image, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          setProgress(Math.round(m.progress * 100));
        }
      },
    })
      .then(({ data }) => {
        setText(data.text);
        setProcessing(false);
      })
      .catch((err) => {
        console.error(err);
        setProcessing(false);
      });
  };

  return (
    <div className="p-4 max-w-lg mx-auto border rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Client-Side OCR (Tesseract.js)</h2>

      <input type="file" accept="image/*" onChange={handleFileChange} />

      {image && (
        <img
          src={image}
          alt="preview"
          className="mt-4 border rounded max-h-64 object-contain"
        />
      )}

      <button
        onClick={runOCR}
        disabled={processing}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        {processing ? "Processing..." : "Run OCR"}
      </button>

      {processing && (
        <div className="mt-2 text-sm text-gray-600">Progress: {progress}%</div>
      )}

      {text && (
        <div className="mt-4 p-3 bg-gray-100 border rounded whitespace-pre-wrap">
          <h3 className="font-semibold mb-2">Extracted Text:</h3>
          {text}
        </div>
      )}
    </div>
  );
}
