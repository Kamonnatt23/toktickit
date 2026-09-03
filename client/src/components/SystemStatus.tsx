import { useState } from "react";
import { checkSystem, Category } from "../api.js";

type UiState = "idle" | "loading" | "success" | "error";

export function SystemStatus({ children }: { children?: React.ReactNode }) {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleCheck() {
    setState("loading");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Fetch Fail");
    }
  }

  return (
    <div className="status-container w-100 mb-4">
      <div className="d-flex justify-content-center align-items-center gap-3 p-3 shadow-sm" style={{ backgroundColor: '#ffffff', borderRadius: '50rem' }}>
        <button 
          className="btn btn-outline-success fw-bold" 
          style={{ borderRadius: '50rem', padding: '0.6rem 2rem' }} 
          onClick={handleCheck} 
          disabled={state === "loading"}
        >
          {state === "loading" ? "Loading…" : "Check System"}
        </button>
        
        {children && (
          <>
            <div className="vr d-none d-md-block" style={{ opacity: 0.2, backgroundColor: '#006B3C', width: '2px' }}></div>
            {children}
          </>
        )}
      </div>

      <div className="mt-4">
        {state === "success" && (
          <div className="alert alert-success" style={{ borderRadius: '20px' }}>
            <strong>System Status: Online</strong>
            {categories.length > 0 && (
              <div className="mt-3">
                <p className="mb-1">Supported Request Categories:</p>
                <ul className="mb-0">
                  {categories.map((c) => (
                    <li key={c.id}>{c.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {state === "error" && (
          <div className="alert alert-danger" style={{ borderRadius: '20px' }}>
            <strong>System Status: Offline</strong>
            <p className="mb-0">{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
