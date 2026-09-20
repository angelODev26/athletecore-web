import { describe, expect, it } from "vitest";

import { toPageModel } from "./pagination";

describe("toPageModel", () => {
  it("envuelve arrays completos (listados sin paginar del contrato)", () => {
    const page = toPageModel(["a", "b", "c"]);
    expect(page).toEqual({ items: ["a", "b", "c"], page: 0, pageSize: 3, totalItems: 3 });
  });

  it("adapta una página Spring (content/number/size/totalElements)", () => {
    const page = toPageModel({ content: [1, 2], number: 1, size: 2, totalElements: 5 });
    expect(page).toEqual({ items: [1, 2], page: 1, pageSize: 2, totalItems: 5 });
  });

  it("respeta el shape ya normalizado (items/page/pageSize/totalItems)", () => {
    const page = toPageModel({ items: ["x"], page: 2, pageSize: 10, totalItems: 42 });
    expect(page).toEqual({ items: ["x"], page: 2, pageSize: 10, totalItems: 42 });
  });
});
