import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobStatusPage from "../JobStatusPage";
import { useJobStream } from "../../hooks/useJobStream";

vi.mock("../../hooks/useJobStream", () => ({ useJobStream: vi.fn() }));

const mockedUseJobStream = vi.mocked(useJobStream);
const completedJob = {
  jobId: "job-123",
  scanId: "scan-456",
  type: "scan_site" as const,
  status: "completed" as const,
  progress: { total: 1, pending: 0, running: 0, completed: 1, failed: 0 },
};

describe("JobStatusPage", () => {
  beforeEach(() =>
    mockedUseJobStream.mockReturnValue({
      status: completedJob,
      error: null,
      done: true,
      transport: "sse",
    }),
  );

  it("navega ao inventário usando scanId, nunca jobId", () => {
    render(
      <MemoryRouter initialEntries={["/jobs/job-123"]}>
        <Routes>
          <Route path="/jobs/:jobId" element={<JobStatusPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: /ver inventário/i }),
    ).toHaveAttribute("href", "/inventory/scan-456");
  });

  it("omite o link quando o backend não informa scanId", () => {
    mockedUseJobStream.mockReturnValue({
      status: { ...completedJob, scanId: undefined },
      error: null,
      done: true,
      transport: "sse",
    });
    render(
      <MemoryRouter initialEntries={["/jobs/job-123"]}>
        <Routes>
          <Route path="/jobs/:jobId" element={<JobStatusPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("link", { name: /ver inventário/i }),
    ).not.toBeInTheDocument();
  });
});
