/**
 * Neutrality Filter Tests
 */
import { describe, it, expect } from "vitest";
import { neutralizeText, hasBiasIndicators } from "@/lib/neutralize";

// ==========================================================================
// 1. Rule-based replacements
// ==========================================================================
describe("Rule-based neutralization", () => {
  it("should replace 'regime' with 'government'", () => {
    const { text, wasModified } = neutralizeText("The regime launched missiles at the base");
    expect(text).toBe("The government launched missiles at the base");
    expect(wasModified).toBe(true);
  });

  it("should replace 'Zionist entity' with 'Israel'", () => {
    const { text } = neutralizeText("Attack on the Zionist entity confirmed");
    expect(text).toBe("Attack on Israel confirmed");
  });

  it("should replace 'martyred' with 'killed'", () => {
    const { text } = neutralizeText("3 fighters martyred in the strike");
    expect(text).toBe("3 fighters killed in the strike");
  });

  it("should preserve case pattern (capitalized)", () => {
    const { text } = neutralizeText("Regime forces advanced on the city");
    expect(text).toBe("Government forces advanced on the city");
  });

  it("should not modify neutral text", () => {
    const input = "Israeli airstrike on Damascus reported, 3 militants killed";
    const { text, wasModified } = neutralizeText(input);
    expect(text).toBe(input);
    expect(wasModified).toBe(false);
  });
});

// ==========================================================================
// 2. Bias detection
// ==========================================================================
describe("Bias indicator detection", () => {
  it("should detect scare quotes around proper nouns", () => {
    expect(hasBiasIndicators('The "Israel" forces attacked the city')).toBe(true);
  });

  it("should detect excessive exclamation marks", () => {
    expect(hasBiasIndicators("Victory is ours!!! The enemy has been crushed!!!")).toBe(true);
  });

  it("should pass clean text", () => {
    expect(hasBiasIndicators("Israeli airstrike on Damascus confirmed, 3 militants killed")).toBe(false);
  });
});

// ==========================================================================
// 3. Safety guarantees
// ==========================================================================
describe("Safety guarantees", () => {
  it("should preserve factual content (numbers, locations, weapons)", () => {
    const input = "The regime launched 12 Shahed-136 drones at Tel Aviv on March 5, 3 terrorists killed";
    const { text } = neutralizeText(input);
    // Numbers preserved
    expect(text).toContain("12");
    expect(text).toContain("3");
    // Locations preserved
    expect(text).toContain("Tel Aviv");
    // Weapons preserved
    expect(text).toContain("Shahed-136");
    // Date preserved
    expect(text).toContain("March 5");
    // Bias replaced
    expect(text).not.toContain("regime");
    expect(text).not.toContain("terrorists");
    expect(text).toContain("government");
    expect(text).toContain("militants");
  });

  it("should never produce empty output from non-empty input", () => {
    const inputs = [
      "The regime attacked the resistance fighters in the occupied territories",
      "Terrorist attack on the Zionist entity by martyrdom operations",
      "The puppet government supports the crusader invasion",
    ];
    for (const input of inputs) {
      const { text, wasModified } = neutralizeText(input);
      expect(text.length).toBeGreaterThan(0);
      expect(wasModified).toBe(true);
      // Output should be at least 50% of input length (bias terms are a small fraction)
      expect(text.length).toBeGreaterThan(input.length * 0.5);
    }
  });
});

// ==========================================================================
// 4. Arabic/Persian replacements
// ==========================================================================
describe("Arabic/Persian neutralization", () => {
  it("should replace Arabic bias terms", () => {
    const { text, wasModified } = neutralizeText("هجوم على الكيان الصهيوني من المقاومة");
    expect(wasModified).toBe(true);
    expect(text).toContain("إسرائيل");
    expect(text).not.toContain("الكيان الصهيوني");
  });

  it("should replace Persian bias terms", () => {
    const { text, wasModified } = neutralizeText("حمله رژیم صهیونیستی به شهر");
    expect(wasModified).toBe(true);
    expect(text).toContain("دولت اسرائیل");
    expect(text).not.toContain("رژیم صهیونیستی");
  });
});

// ==========================================================================
// 5. Multi-word phrase priority
// ==========================================================================
describe("Multi-word phrase priority", () => {
  it("should replace 'terrorist attack' as a unit, not 'terrorist' alone", () => {
    const { text } = neutralizeText("A terrorist attack was reported in the area");
    expect(text).toBe("An armed attack was reported in the area");
    expect(text).not.toContain("militant attack");
  });

  it("should replace 'resistance fighters' as a unit", () => {
    const { text } = neutralizeText("The resistance fighters launched rockets");
    expect(text).toBe("The armed groups launched rockets");
  });
});
