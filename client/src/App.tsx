import { SystemStatus } from "./components/SystemStatus.js";
import { DevProvider } from "./contexts/DevContext.js";
import { DevRequesterSelection } from "./components/DevRequesterSelection.js";
import { CreateTicket } from "./components/CreateTicket.js";

export default function App() {
  return (
    <DevProvider>
      <DevRequesterSelection />
      <div className="container py-5" style={{ maxWidth: 800 }}>
        <h1 className="display-4 fw-bolder text-center mb-5 mt-3" style={{ color: '#212529', letterSpacing: '-0.02em' }}>
          TokTickIT <span style={{ color: '#006B3C' }}>IT Service Desk</span>
        </h1>
        <SystemStatus />
        <CreateTicket />
      </div>
    </DevProvider>
  );
}

