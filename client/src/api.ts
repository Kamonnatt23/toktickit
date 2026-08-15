const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  let healthResp;
  try {
    healthResp = await fetch(`${API_URL}/api/health`);
  } catch (e) {
    throw new Error("Unable to connect to TokTickIT API");
  }
  if (!healthResp.ok) throw new Error("Unable to connect to TokTickIT API");

  let categoriesResp;
  try {
    categoriesResp = await fetch(`${API_URL}/api/categories`);
  } catch (e) {
    throw new Error("Unable to connect to TokTickIT API");
  }
  if (!categoriesResp.ok) throw new Error("Unable to connect to TokTickIT API");

  const categories: Category[] = await categoriesResp.json();
  return { online: true, categories };
}
