import { describe, expect, it } from "vitest";
import { displayName, initialsOf } from "@/components/settings/team-print-kit";

describe("team-print-kit", () => {
  it("arma el nombre y las iniciales", () => {
    expect(displayName({ firstName: "Ana", lastName: "Pérez", email: "a@x.com" })).toBe("Ana Pérez");
    expect(displayName({ firstName: null, lastName: null, email: "luis@x.com" })).toBe("luis");
    expect(initialsOf("ana maría pérez")).toBe("AM");
  });
});
