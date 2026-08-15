import { SystemStatus } from "./components/SystemStatus.js";

export default function App() {
  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>
      <SystemStatus />
    </div>
  );
}

