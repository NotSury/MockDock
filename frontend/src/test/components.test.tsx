import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Endpoint, ScenarioInput } from "../api/types";
import { MethodBadge, StatusBadge } from "../components/Badges";
import { EndpointList } from "../components/endpoint/EndpointList";
import { ScenarioEditor } from "../components/endpoint/ScenarioEditor";
import { KeyValueEditor, type KeyValueRow } from "../components/KeyValueEditor";
import { TooltipProvider } from "../components/Tooltip";
import { newScenario } from "../lib/http";

// Monaco can't run in jsdom; swap in a textarea with the same contract.
vi.mock("../components/CodeEditor", () => ({
  CodeEditor: ({ value, onChange, ariaLabel }: { value: string; onChange?: (v: string) => void; ariaLabel?: string }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TooltipProvider>{ui}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("badges", () => {
  it("renders method and status", () => {
    wrap(
      <>
        <MethodBadge method="DELETE" />
        <StatusBadge status={404} showText />
      </>,
    );
    expect(screen.getByText("DEL")).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Not Found")).toBeInTheDocument();
  });
});

describe("KeyValueEditor", () => {
  function Harness({ onRows }: { onRows: (r: KeyValueRow[]) => void }) {
    const [rows, setRows] = useState<KeyValueRow[]>([]);
    return (
      <KeyValueEditor
        rows={rows}
        onChange={(r) => {
          setRows(r);
          onRows(r);
        }}
      />
    );
  }

  it("adds a row when typing into the trailing blank row, and removes rows", async () => {
    const onRows = vi.fn();
    wrap(<Harness onRows={onRows} />);
    await userEvent.type(screen.getByLabelText("Header 1"), "X-Env");
    await userEvent.type(screen.getByLabelText("Value 1"), "mock");
    expect(onRows).toHaveBeenLastCalledWith([{ key: "X-Env", value: "mock", enabled: true }]);
    expect(screen.getByLabelText("Header 2")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Remove X-Env" }));
    expect(onRows).toHaveBeenLastCalledWith([]);
  });
});

describe("ScenarioEditor", () => {
  function Harness({ initial }: { initial: ScenarioInput }) {
    const [s, setS] = useState(initial);
    return (
      <ScenarioEditor scenario={s} onChange={setS} isLive={false} onMakeLive={() => {}} onDelete={() => {}} canDelete onSave={() => {}} />
    );
  }

  it("shows JSON errors live and accepts templates", () => {
    wrap(<Harness initial={newScenario()} />);
    const body = screen.getByLabelText("Response body editor");
    fireEvent.change(body, { target: { value: '{"id": {{params.id}}}' } });
    expect(screen.getByText(/Valid JSON/)).toBeInTheDocument();
    fireEvent.change(body, { target: { value: '{"id": ' } });
    expect(screen.getByText(/⚠/)).toBeInTheDocument();
  });

  it("switches to an empty body for 204", async () => {
    wrap(<Harness initial={newScenario()} />);
    const status = screen.getByLabelText("Status code");
    fireEvent.change(status, { target: { value: "204" } });
    expect(screen.getByText(/never carries a body/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Empty" })).toHaveAttribute("aria-checked", "true");
  });

  it("applies delay presets", async () => {
    wrap(<Harness initial={newScenario()} />);
    await userEvent.click(screen.getByRole("button", { name: "1s" }));
    expect(screen.getByLabelText(/Delay/, { selector: "input[type=number]" })).toHaveValue(1000);
  });
});

const ep = (id: number, method: string, path: string, enabled = true): Endpoint => ({
  id,
  project_id: 1,
  method: method as Endpoint["method"],
  path,
  name: "",
  description: "",
  enabled,
  active_scenario: "OK",
  failure_rate: id === 2 ? 0.25 : 0,
  failure_status: 500,
  failure_body: "",
  scenarios: [{ id, name: "OK", status_code: 200, headers: [], body_type: "json", body: "{}", delay_ms: 0 }],
  created_at: "",
  updated_at: "",
  mock_path: "",
});

describe("EndpointList", () => {
  const endpoints = [ep(1, "GET", "/users"), ep(2, "POST", "/users"), ep(3, "GET", "/orders/:id", false)];

  it("groups, filters by text and method, and selects", async () => {
    const onSelect = vi.fn();
    wrap(<EndpointList endpoints={endpoints} loading={false} selectedId={null} creating={false} onSelect={onSelect} onNew={() => {}} />);
    expect(screen.getByText("/users", { selector: "span.font-mono.text-\\[10\\.5px\\]" })).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Filter endpoints"), "orders");
    expect(screen.queryAllByText("/users", { selector: "span" }).length).toBe(0);
    await userEvent.clear(screen.getByLabelText("Filter endpoints"));

    await userEvent.click(screen.getByRole("button", { name: "POST" }));
    const rows = screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
    expect(rows).toHaveLength(1);
    await userEvent.click(rows[0]);
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(within(rows[0]).getByRole("switch")).toBeChecked();
  });

  it("shows an empty state", () => {
    wrap(<EndpointList endpoints={[]} loading={false} selectedId={null} creating={false} onSelect={() => {}} onNew={() => {}} />);
    expect(screen.getByText("No endpoints")).toBeInTheDocument();
  });
});
