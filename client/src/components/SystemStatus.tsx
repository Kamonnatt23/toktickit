import { useState } from "react";
import { checkSystem, Category } from "../api.js";

type UiState = "idle" | "loading" | "success" | "error";

export function SystemStatus() {
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
    <div className="status-container">
      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      <div className="mt-4">
        {state === "success" && (
          <div className="alert alert-success">
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
          <div className="alert alert-danger">
            <strong>System Status: Offline</strong>
            <p className="mb-0">{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
