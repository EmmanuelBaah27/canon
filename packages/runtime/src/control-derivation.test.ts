import { describe, it, expect } from "vitest";
import { deriveControls, extractPublicProperties } from "./control-derivation";
import { manifest } from "./test-fixtures";
describe("source-evidenced controls", () => {
  it("maps only supported public evidence and separates structural controls", () => {
    const properties = [
      { name: "checked", kind: "boolean" },
      { name: "size", kind: "enum", options: ["small", "large"] },
      { name: "choice", kind: "enum", options: ["a", "b", "c", "d", "e", "f"] },
      { name: "label", kind: "text" },
      { name: "amount", kind: "number", min: 0, max: 10 },
      {
        name: "spacing",
        kind: "number",
        tokens: ["space.sm"],
        category: "spacing",
      },
      { name: "icon", kind: "icon", options: ["check"] },
      { name: "children", kind: "slot", options: ["Label"] },
      { name: "variant", kind: "variant", options: ["primary"] },
      { name: "viewport", kind: "breakpoint", options: ["narrow", "wide"] },
      {
        name: "duration",
        kind: "motion",
        tokens: ["motion.fast"],
        category: "motion",
      },
      { name: "ref", kind: "text" },
      { name: "internalId", kind: "text", internal: true },
      { name: "layout", kind: "number", derived: true },
      { name: "ariaHidden", kind: "boolean", invariant: true },
      { name: "complex", kind: "complex" },
      { name: "unknown", kind: "text", ambiguous: true },
    ] as const;
    const result = deriveControls(manifest, properties);
    expect(
      Object.fromEntries(result.controls.map((c) => [c.id, c.control])),
    ).toMatchObject({
      checked: "switch",
      size: "segmented",
      choice: "select",
      label: "text",
      amount: "slider",
      spacing: "token",
      icon: "icon",
      children: "slot",
      variant: "variant",
      viewport: "breakpoint",
      duration: "token",
    });
    expect(result.controls.find((c) => c.id === "children")?.section).toBe(
      "advanced",
    );
    expect(
      result.controls.filter((c) =>
        [
          "ref",
          "internalId",
          "layout",
          "ariaHidden",
          "complex",
          "unknown",
        ].includes(c.id),
      ),
    ).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe("blocker");
    expect(result.controls.some((c) => c.control === "state")).toBe(true);
    expect(
      result.controls.find((c) => c.id === "token-binding:0")?.tokens,
    ).toContain("tokens.color.border");
  });
  it("extracts public props from the selected component rather than unrelated internals", () => {
    const source = `type Internal = { secret: boolean }; interface CheckboxProps { checked?: boolean; size?: 'small' | 'large'; label?: string; onChange?: () => void; } export const Checkbox = (props: CheckboxProps) => <input checked={props.checked}/>;`;
    expect(
      extractPublicProperties(source, "Checkbox").map((p) => p.name),
    ).toEqual(["checked", "size", "label"]);
  });
  it("reports unsupported unresolved public evidence instead of guessing a control", () => {
    expect(
      extractPublicProperties(
        "export const Checkbox = (props: Missing) => <input/>;",
        "Checkbox",
      )[0].ambiguous,
    ).toBe(true);
  });
});
it("only exposes editable visual bindings while preserving the complete canonical token choices", () => {
  const indexed = {
    ...manifest,
    tokens: [
      ...manifest.tokens,
      { property: "control", category: "size", token: "var(--system-control)" },
    ],
  };
  const result = deriveControls(
    indexed,
    [],
    [{ property: "width", token: "tokens.size.control" }],
  );
  expect(
    result.controls.filter((c) => c.control === "token").map((c) => c.id),
  ).toEqual(["token-binding:1"]);
  expect(
    result.controls.find((c) => c.id === "token-binding:1")?.tokens,
  ).toContain("var(--system-control)");
});

it("preserves evidenced defaults and classifies declared advanced and structural properties", () => {
  const source = `interface CheckboxProps { checked?: boolean; variant?: 'quiet' | 'solid';
/** @advanced */
count?: number;
/** @structural
 * @control slot
 */
content?: 'Label' | 'Icon'; } export const Checkbox = ({checked=true,variant='quiet'}: CheckboxProps) => <input checked={checked}/>;`;
  const properties = extractPublicProperties(source, "Checkbox");
  expect(properties.find((p) => p.name === "checked")?.defaultValue).toBe(true);
  const result = deriveControls(
    { ...manifest, tokens: [], states: [] },
    properties,
  );
  expect(result.controls.find((c) => c.id === "variant")?.control).toBe(
    "variant",
  );
  expect(result.controls.find((c) => c.id === "count")?.section).toBe(
    "advanced",
  );
  expect(result.controls.find((c) => c.id === "content")?.structural).toBe(
    true,
  );
  expect(result.controls.find((c) => c.id === "content")?.control).toBe("slot");
});
