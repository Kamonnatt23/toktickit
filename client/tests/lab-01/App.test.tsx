import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

describe("App", () => {
  beforeEach(() => {
    localStorage.setItem('dev_requester_user', JSON.stringify({ id: 1, name: 'Alice Smith', email: 'alice@example.com', role: 'Requester' }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the TokTickIT heading", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
    });
  });

  it("shows Online and the seeded categories on success", async () => {
    vi.spyOn(api, "checkSystem").mockResolvedValue({
      online: true,
      categories: [
        { id: 1, name: "Account and Access" },
        { id: 2, name: "Hardware" },
        { id: 3, name: "Software" },
        { id: 4, name: "Network" }
      ]
    });
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Check System/i })).toBeInTheDocument();
    });
    const btn = screen.getByRole("button", { name: /Check System/i });
    await userEvent.click(btn);
    
    await waitFor(() => {
      expect(screen.getByText(/System Status: Online/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Supported Request Categories:")).toBeInTheDocument();
    expect(screen.getAllByText("Account and Access")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Hardware")[0]).toBeInTheDocument();
  });

  it("shows an Offline error message when the API is unavailable", async () => {
    vi.spyOn(api, "checkSystem").mockRejectedValue(new Error("Unable to connect to TokTickIT API"));
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Check System/i })).toBeInTheDocument();
    });
    const btn = screen.getByRole("button", { name: /Check System/i });
    await userEvent.click(btn);
    
    await waitFor(() => {
      expect(screen.getByText(/System Status: Offline/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Unable to connect to TokTickIT API")).toBeInTheDocument();
  });
});
