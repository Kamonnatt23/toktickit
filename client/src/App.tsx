import { SystemStatus } from "./components/SystemStatus.js";
import { DevProvider } from "./contexts/DevContext.js";
import { DevRequesterSelection } from "./components/DevRequesterSelection.js";
import { CreateTicket } from "./components/CreateTicket.js";

export default function App() {
  return (
    <DevProvider>
      <DevRequesterSelection />
      <div className="container py-5" style={{ maxWidth: 800 }}>
        <h1 className="h3 mb-4">
          TokTickIT <span className="text-success">IT Service Desk</span>
        </h1>
        <SystemStatus />
        <CreateTicket />
      </div>
    </DevProvider>
  );
}

