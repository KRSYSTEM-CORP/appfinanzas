import { describe, expect, it } from "vitest";
import { isRateStale, isValueDateCurrent, parseBcvHome, rateDay, todayVe } from "@/lib/bcv-parse";

// Misma estructura que la página real de www.bcv.org.ve (2026-11-09).
const HTML = `
<div id="euro"><div class="row recuadrotsmc"><div class="col-sm-6 col-xs-6">
  <img src="/sites/default/files/euro-04_2.png"> <span style="display: inline; margin-left: 15px;"> EUR</span></div>
  <div class="col-sm-6 col-xs-6 centrado textp"><strong class="strong-tb">1.001,18602288 </strong></div></div></div>
<div id="dolar" class="col-sm-12"><div class="row recuadrotsmc"><div class="col-sm-6 col-xs-6">
  <img src="/sites/default/files/dollar-04_2.png"> <span style="display: inline; margin-left: 15px;"> USD</span></div>
  <div class="col-sm-6 col-xs-6 centrado textp"><strong class="strong-tb">897,53830000 </strong></div></div></div>
<div class="pull-right dinpro center"><span class="date-display-single">Fecha Valor: <span> Lunes, 09 Noviembre 2026</span></span></div>
<table><tr><td>BBVA Provincial</td><td>896,7994</td></tr></table>
<script>var USD = 5;</script>`;

describe("lectura de la página del BCV", () => {
  it("lee USD, EUR y la fecha valor", () => {
    expect(parseBcvHome(HTML)).toEqual({ usd: 897.5383, eur: 1001.18602288, valueDate: "2026-11-09" });
  });
  it("entiende meses con tilde y sin ella", () => {
    const h = HTML.replace("09 Noviembre 2026", "3 septiembre 2026");
    expect(parseBcvHome(h)?.valueDate).toBe("2026-09-03");
  });
  it("devuelve null si falta una tasa o la fecha (nunca adivina)", () => {
    expect(parseBcvHome(HTML.replace("897,53830000", "n/d"))).toBeNull();
    expect(parseBcvHome(HTML.replace("Fecha Valor:", "Fecha:"))).toBeNull();
    expect(parseBcvHome("<html>mantenimiento</html>")).toBeNull();
  });
  it("rechaza valores absurdos", () => {
    expect(parseBcvHome(HTML.replace("897,53830000", "0,5"))).toBeNull();
  });
});

describe("día de tasa (cambia a las 7:00 p. m. de Venezuela)", () => {
  it("a las 6:59 p. m. sigue siendo el mismo día; a las 7:00 p. m. pasa al siguiente", () => {
    expect(rateDay(new Date("2026-11-09T22:59:00Z"))).toBe("2026-11-09"); // 6:59 p. m. VE
    expect(rateDay(new Date("2026-11-09T23:00:00Z"))).toBe("2026-11-10"); // 7:00 p. m. VE
  });
  it("una tasa guardada a las 7 p. m. sigue vigente al día siguiente hasta las 6:59 p. m.", () => {
    const saved = new Date("2026-11-09T23:05:00Z");
    expect(isRateStale(saved, new Date("2026-11-10T20:00:00Z"))).toBe(false); // 4 p. m. VE
    expect(isRateStale(saved, new Date("2026-11-10T23:00:00Z"))).toBe(true); // 7 p. m. VE
  });
  it("sin tasa guardada siempre hay que pedirla", () => {
    expect(isRateStale(null)).toBe(true);
  });
});

describe("fecha valor", () => {
  const now = new Date("2026-11-09T16:00:00Z"); // 12:00 m. VE del lunes 9
  it("hoy y mañana sirven; ayer no", () => {
    expect(todayVe(now)).toBe("2026-11-09");
    expect(isValueDateCurrent("2026-11-09", now)).toBe(true);
    expect(isValueDateCurrent("2026-11-10", now)).toBe(true);
    expect(isValueDateCurrent("2026-11-08", now)).toBe(false);
  });
  it("de madrugada en UTC sigue contando el día de Venezuela", () => {
    expect(todayVe(new Date("2026-11-10T02:00:00Z"))).toBe("2026-11-09"); // 10 p. m. VE
  });
});
