import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeJobStatus, useJobStream } from "../useJobStream";

const stream = vi.hoisted(() => {
  const listeners = new Map<string, (event: Event) => void>();
  return {
    listeners,
    close: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    onerror: null as ((event: Event) => void) | null,
  };
});

vi.mock("../../api/client", () => ({
  get: vi.fn(),
  openEventStream: vi.fn(() => stream),
}));

describe("useJobStream", () => {
  beforeEach(() => {
    stream.listeners.clear();
    stream.close.mockClear();
    stream.addEventListener.mockClear();
    stream.onerror = null;
    vi.useRealTimers();
  });

  it("normaliza o payload homologado de progresso", () => {
    expect(normalizeJobStatus({
      type: "progress",
      kind: "files",
      status: "RUNNING",
      scanId: "scan-1",
      total: 10,
      processed: 4,
      failed: 1,
    }, "job-1")).toEqual(expect.objectContaining({
      jobId: "job-1",
      scanId: "scan-1",
      status: "running",
      progress: {
        total: 10,
        completed: 4,
        failed: 1,
        running: 1,
        pending: 4,
      },
    }));
  });

  it("consome eventos message usados pelo backend homologado", async () => {
    const { result } = renderHook(() => useJobStream("job-1"));
    const listener = stream.listeners.get("message");
    expect(listener).toBeDefined();

    act(() => {
      listener?.(new MessageEvent("message", {
        data: JSON.stringify({
          type: "progress",
          status: "DONE",
          total: 2,
          processed: 2,
          failed: 0,
        }),
      }));
    });

    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.status?.status).toBe("completed");
    expect(result.current.status?.progress.completed).toBe(2);
    expect(stream.close).toHaveBeenCalled();
  });

  it("ativa polling após falha do SSE", async () => {
    vi.useFakeTimers();
    const getStatus = vi.fn().mockResolvedValue({
      jobId: "job-2",
      type: "retention_files",
      progress: {
        status: "RUNNING",
        total: 5,
        processed: 1,
        failed: 0,
      },
    });
    const { result } = renderHook(() => useJobStream("job-2", {
      fallbackDelayMs: 50,
      pollIntervalMs: 100,
      getStatus,
    }));

    await act(async () => {
      stream.onerror?.(new Event("error"));
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(getStatus).toHaveBeenCalledWith("job-2");
    expect(result.current.transport).toBe("polling");
    expect(result.current.status?.progress.completed).toBe(1);
  });
});
