// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AthleteAvatar } from "./athlete-avatar";

// Sin `globals: true` en Vitest no hay auto-cleanup del DOM entre tests.
afterEach(cleanup);

describe("AthleteAvatar", () => {
  it("muestra iniciales cuando la imagen falla y reintenta con una URL nueva", () => {
    const { rerender } = render(
      <AthleteAvatar firstName="Ana" lastName="García" photoUrl="https://cdn.ejemplo.com/vieja.png" />,
    );

    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("AG")).toBeInTheDocument();

    // Tras una edición la URL cambia: la imagen nueva debe intentarse de nuevo.
    rerender(
      <AthleteAvatar firstName="Ana" lastName="García" photoUrl="https://cdn.ejemplo.com/nueva.png" />,
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://cdn.ejemplo.com/nueva.png");
  });

  it("sin foto muestra iniciales sin renderizar un <img> vacío", () => {
    render(<AthleteAvatar firstName="Luis" lastName="Pérez" photoUrl={null} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("LP")).toBeInTheDocument();
  });
});
