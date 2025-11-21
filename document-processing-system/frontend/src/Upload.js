import axios from "axios";
import { useState } from "react";

export default function Upload() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState("");

  const uploadFile = async () => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axios.post(
      "http://localhost:5000/api/documents/upload",
      formData
    );

    setResult(response.data.extracted_text);
  };

  return (
    <div>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={uploadFile}>Upload</button>
      <pre>{result}</pre>
    </div>
  );
}
