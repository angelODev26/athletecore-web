import { describe, expect, it } from "vitest";

import {
  categoryLabel,
  classificationLabel,
  monthNameEs,
  parseTimeToSeconds,
  styleLabel,
} from "./format";

describe("parseTimeToSeconds (C2)", () => {
  it("acepta mm:ss.fff con minutos de dos dígitos", () => {
    expect(parseTimeToSeconds("01:05.250")).toBe(65.25);
  });

  it("acepta m:ss.fff con minutos de un dígito", () => {
    expect(parseTimeToSeconds("1:05.250")).toBe(65.25);
  });

  it("acepta h:mm:ss.fff con horas", () => {
    expect(parseTimeToSeconds("1:02:03.750")).toBe(3723.75);
  });

  it("acepta 0:minutos y devuelve un número (0:12.000 → 12)", () => {
    expect(parseTimeToSeconds("0:12.000")).toBe(12);
  });

  it("ignora espacios alrededor", () => {
    expect(parseTimeToSeconds("  01:05.250  ")).toBe(65.25);
  });

  it("rechaza si faltan los 3 dígitos de milisegundos", () => {
    expect(parseTimeToSeconds("1:5.25")).toBeNull();
    expect(parseTimeToSeconds("1:05.25")).toBeNull();
    expect(parseTimeToSeconds("1:05.2500")).toBeNull();
  });

  it("rechaza segundos >= 60", () => {
    expect(parseTimeToSeconds("1:60.000")).toBeNull();
    expect(parseTimeToSeconds("1:02:60.000")).toBeNull();
  });

  it("rechaza texto libre y cadenas vacías", () => {
    expect(parseTimeToSeconds("abc")).toBeNull();
    expect(parseTimeToSeconds("")).toBeNull();
    expect(parseTimeToSeconds("65.25")).toBeNull();
    expect(parseTimeToSeconds("01:05")).toBeNull();
  });
});

describe("etiquetas ES de presentación (tolerancia a extensión, doc 06 §1)", () => {
  it("mapea los estilos del catálogo", () => {
    expect(styleLabel("LIBRE")).toBe("Libre");
    expect(styleLabel("ESPALDA")).toBe("Espalda");
    expect(styleLabel("COMBINADO")).toBe("Combinado");
  });

  it("mapea categorías y clasificaciones", () => {
    expect(categoryLabel("JUVENIL")).toBe("Juvenil");
    expect(classificationLabel("POR_ENCIMA_DEL_PODIO")).toBe("Por encima del podio");
    expect(classificationLabel("CERCANO_A_MEDALLERIA")).toBe("Cercano a medallería");
    expect(classificationLabel("FUERA_DE_RANGO")).toBe("Fuera de rango");
  });

  it("devuelve el valor crudo si el enum se extiende sin migración", () => {
    expect(styleLabel("ESTILO_NUEVO")).toBe("ESTILO_NUEVO");
    expect(categoryLabel("CATEGORIA_NUEVA")).toBe("CATEGORIA_NUEVA");
    expect(classificationLabel("OTRA")).toBe("OTRA");
  });
});

describe("monthNameEs", () => {
  it("mapea 1–12 sin usar Date", () => {
    expect(monthNameEs(1)).toBe("Enero");
    expect(monthNameEs(3)).toBe("Marzo");
    expect(monthNameEs(12)).toBe("Diciembre");
  });

  it("fuera de rango devuelve el número tal cual", () => {
    expect(monthNameEs(0)).toBe("0");
    expect(monthNameEs(13)).toBe("13");
  });
});
