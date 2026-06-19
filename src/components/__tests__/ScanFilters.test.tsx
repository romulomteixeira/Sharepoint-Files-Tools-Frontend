import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScanFilters from "../ScanFilters";
import type { ScanFilters as ScanFiltersType } from "../../types";

const BASE: ScanFiltersType = {
  excludeOneDrive: true, excludeSystem: true, excludeArchived: true, excludeNoDrives: true,
  excludeChannelPrivate: false, excludeChannelShared: false, excludeEmbedded: false, excludeSubsites: false,
};

describe("ScanFilters", () => {
  it("renderiza categorias do fallback e reflete o estado marcado", () => {
    render(<ScanFilters value={BASE} onChange={() => {}} />);
    const oneDrive = screen.getByRole("checkbox", { name: /onedrive pessoais/i });
    expect(oneDrive).toBeChecked();
    const embedded = screen.getByRole("checkbox", { name: /sharepoint embedded/i });
    expect(embedded).not.toBeChecked();
  });

  it("dispara onChange ao alternar uma categoria", () => {
    const onChange = vi.fn();
    render(<ScanFilters value={BASE} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /sharepoint embedded/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ excludeEmbedded: true }));
  });

  it("aplica o preset Agressivo (todas as categorias)", () => {
    const onChange = vi.fn();
    render(<ScanFilters value={BASE} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /agressivo/i }));
    const arg = onChange.mock.calls[0][0] as ScanFiltersType;
    expect(Object.values(arg).every(Boolean)).toBe(true);
  });

  it("aplica o preset Limpar (nenhuma categoria)", () => {
    const onChange = vi.fn();
    render(<ScanFilters value={BASE} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /limpar/i }));
    const arg = onChange.mock.calls[0][0] as ScanFiltersType;
    expect(Object.values(arg).some(Boolean)).toBe(false);
  });

  it("usa o catálogo fornecido quando presente", () => {
    render(
      <ScanFilters
        value={BASE}
        onChange={() => {}}
        categories={[{ key: "excludeSystem", category: "system_site", label: "Só sistema", needsDrives: false, needsTeams: false }]}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /só sistema/i })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /onedrive/i })).not.toBeInTheDocument();
  });
});
