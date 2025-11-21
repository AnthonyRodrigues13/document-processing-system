import Upload from "./Upload";
import ClientOCR from "./components/ClientOCR";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <div style={{ padding: "40px" }}>
      <h1>Document Processing App</h1>

      {/* Upload Component */}
      <Upload />

      <hr style={{ margin: "40px 0" }} />

      {/* Client-Side OCR */}
      <ClientOCR />

      <hr style={{ margin: "40px 0" }} />

      {/* Smart Dashboard */}
      <Dashboard />
    </div>
  );
}

export default App;
