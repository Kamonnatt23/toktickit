import { useState, useEffect, useRef } from "react";
import { checkSystem, Category } from "../api.js";

type UiState = "idle" | "loading" | "success" | "error";

export function SystemStatus({ children }: { children?: React.ReactNode }) {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Click-outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        (state === "success" || state === "error") &&
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setState("idle");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state]);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (state === "success" || state === "error") {
      timer = setTimeout(() => {
        setState("idle");
      }, 5000);
    }
    return () => clearTimeout(timer);
  }, [state]);

  async function handleCheck() {
    if (state === "success" || state === "error") {
      setState("idle");
      return;
    }
    
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
    <>
      <button 
        ref={buttonRef}
        className="btn btn-outline-success fw-bold" 
        style={{ borderRadius: '50rem', padding: '0.6rem 2rem' }} 
        onClick={handleCheck} 
        disabled={state === "loading"}
      >
        {state === "loading" ? "Loading…" : "Check System"}
      </button>
      
      {children}

      {(state === "success" || state === "error") && (
        <div ref={popupRef} className="position-absolute start-0 end-0 mt-3 mx-auto" style={{ maxWidth: 800, zIndex: 1050 }}>
          {state === "success" && (
            <div className="alert alert-success shadow-lg border-0" style={{ borderRadius: '20px' }}>
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
            <div className="alert alert-danger shadow-lg border-0" style={{ borderRadius: '20px' }}>
              <strong>System Status: Offline</strong>
              <p className="mb-0">{errorMsg}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
