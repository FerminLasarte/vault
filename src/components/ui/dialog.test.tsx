// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

describe("DialogContent", () => {
  // Every dialog in the app gets this X, and a screen reader announces it by
  // the hidden text inside it, which is copy like any other.
  it("names its close button in Spanish", async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Nueva transacción</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(await screen.findByRole("button", { name: "Cerrar" })).toBeTruthy();
  });
});
