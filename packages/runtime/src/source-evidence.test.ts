import { expect, it } from "vitest";
import {
  deriveCheckboxPreview,
  extractPublicProperties,
} from "./source-evidence";

it.each([
  `export const Checkbox = (props: Props) => <Check.Root checked={true} />;`,
  `export const Checkbox = (props: Props) => <Check.Root style={{color:props.error ? tokens.color.error : tokens.color.text}} />;`,
  `export const Checkbox = (props: Props) => <><Check.Root/><Check.Root/></>;`,
])(
  "declines source behavior the reviewed reconstruction cannot preserve: %s",
  (component) => {
    const source = `import * as Check from '@radix-ui/react-checkbox'; ${component}`;
    expect(deriveCheckboxPreview(source, "Checkbox.tsx", [])).toBeUndefined();
  },
);

it.each([
  `const Helper=(props:Props)=><Check.Root checked={props.checked}/>; export const Checkbox=()=> <div/>;`,
  `export const Checkbox=(props:Props)=>props.hidden?null:<Check.Root checked={props.checked}/>;`,
  `export function Checkbox(props:Props){if(props.hidden)return null;return <Check.Root checked={props.checked}/>;}`,
  `export const Checkbox=(props:Props)=><Check.Root checked={other.checked}/>;`,
  `export const Checkbox=(props:Props)=><section hidden={props.hidden}><Check.Root checked={props.checked}/></section>;`,
])(
  "blocks unpreserved selected-export structure or property bindings: %s",
  (component) => {
    expect(
      deriveCheckboxPreview(
        `import * as Check from '@radix-ui/react-checkbox'; ${component}`,
        "Checkbox.tsx",
        [],
        "Checkbox",
      ),
    ).toBeUndefined();
  },
);

it.each([
  `const Unrelated=(other:Props)=><Check.Root checked={true}/>; export const Checkbox=(props:Props)=><Check.Root checked={props.checked} disabled={props.disabled}/>;`,
  `export function Checkbox({checked,disabled}:Props){return <Check.Root checked={checked} disabled={disabled}/>;}`,
  `const Selected=(props:Props)=><Check.Root checked={props.checked}/>; export {Selected as Checkbox};`,
])(
  "supports the selected direct render independently of unrelated helpers: %s",
  (component) => {
    expect(
      deriveCheckboxPreview(
        `import * as Check from '@radix-ui/react-checkbox'; ${component}`,
        "Checkbox.tsx",
        [],
        "Checkbox",
      )?.kind,
    ).toBe("checkbox");
  },
);

it("derives inline bindings only from the selected Root instead of unrelated helpers", () => {
  const source = `import * as Check from '@radix-ui/react-checkbox'; import {tokens} from './tokens'; const Helper=(props:Props)=><Check.Root checked={props.checked} style={{padding:tokens.space.gap}}/>; export const Checkbox=(props:Props)=><Check.Root checked={props.checked} style={{borderColor:tokens.color.border}}/>;`;
  expect(
    deriveCheckboxPreview(source, "Checkbox.tsx", [], "Checkbox")
      ?.inlineBindings,
  ).toEqual([{ property: "borderColor", token: "tokens.color.border" }]);
});

it.each([
  `export const Checkbox=(props:{checked?:boolean;disabled?:boolean})=><Check.Root checked={props.checked}/>;`,
  `export const Checkbox=({checked=!false,disabled=false}:{checked?:boolean;disabled?:boolean})=><Check.Root checked={checked} disabled={disabled}/>;`,
])(
  "blocks unforwarded public state and defaults outside the literal grammar: %s",
  (component) => {
    expect(
      deriveCheckboxPreview(
        `import * as Check from '@radix-ui/react-checkbox'; ${component}`,
        "Checkbox.tsx",
        [],
        "Checkbox",
      ),
    ).toBeUndefined();
  },
);

it.each([
  [true, false],
  [false, true],
])(
  "preserves forwarded literal defaults checked=%s disabled=%s",
  (checked, disabled) => {
    const source = `import * as Check from '@radix-ui/react-checkbox'; export const Checkbox=({checked=${checked},disabled=${disabled}}:{checked?:boolean;disabled?:boolean})=><Check.Root checked={checked} disabled={disabled}/>;`;
    expect(
      deriveCheckboxPreview(source, "Checkbox.tsx", [], "Checkbox")
        ?.forwardedStates,
    ).toEqual(["checked", "disabled"]);
    expect(
      deriveCheckboxPreview(source, "Checkbox.tsx", [], "Checkbox")
        ?.stateDefaults,
    ).toEqual({ checked, disabled });
    expect(
      extractPublicProperties(source, "Checkbox").find(
        (property) => property.name === "checked",
      )?.defaultValue,
    ).toBe(checked);
    expect(
      extractPublicProperties(source, "Checkbox").find(
        (property) => property.name === "disabled",
      )?.defaultValue,
    ).toBe(disabled);
  },
);

it("reports a nonliteral state default as ambiguous instead of assigning false", () => {
  const properties = extractPublicProperties(
    `export const Checkbox=({checked=!false}:{checked?:boolean})=><input/>;`,
    "Checkbox",
  );
  expect(
    properties.find((property) => property.name === "checked")?.ambiguous,
  ).toBe(true);
});

it.each([false, true])(
  "keeps wrapper state forwarding separate from Root forwarding: %s",
  (forwarded) => {
    const source = `import * as Check from '@radix-ui/react-checkbox'; import {BaseControl} from './BaseControl'; export const Checkbox=({checked=false,disabled=true}:{checked?:boolean;disabled?:boolean})=><BaseControl${forwarded ? " disabled={disabled}" : ""}><Check.Root checked={checked} disabled={disabled}/></BaseControl>;`;
    const preview = deriveCheckboxPreview(
      source,
      "Checkbox.tsx",
      [],
      "Checkbox",
      {
        "BaseControl.tsx": `export const BaseControl=(props:any)=><div className="control" {...props}/>;`,
      },
    );
    expect(preview?.forwardedStates).toEqual(["checked", "disabled"]);
    expect(preview?.wrapperForwardedStates).toEqual(
      forwarded ? ["disabled"] : [],
    );
  },
);
it('resolves typed token leaves through the selected local import alias and module identity', async () => {
  const { extractTokenValues } = await import('./source-evidence');
  const sources = {
    'src/Checkbox.tsx': "import { tokens as palette } from './tokens'; export const Checkbox=()=>null;",
    'src/tokens.ts': "const scale={size:{control:24},opacity:{disabled:0.5},state:{omit:false,empty:null}} as const; export {scale as tokens};",
    'src/unrelated.ts': "export const tokens={size:{control:999}};",
  };
  expect(extractTokenValues(sources, 'src/Checkbox.tsx')).toMatchObject({ 'palette.size.control':24, 'palette.opacity.disabled':0.5, 'palette.state.omit':false, 'palette.state.empty':null });
  expect(extractTokenValues(sources, 'src/Checkbox.tsx')).not.toHaveProperty('tokens.size.control');
});
it('does not invent values for unresolved module imports or unsupported token expressions', async () => {
  const { extractTokenValues } = await import('./source-evidence');
  const source = "import { tokens as palette } from './tokens'; export const Checkbox=()=>null;";
  for (const definition of ["export const tokens={size:{control:makeSize()}};", "export const tokens={size:{control:{value:24}}};", "export { tokens } from './missing';"]) {
    expect(extractTokenValues({ 'Checkbox.tsx':source, 'tokens.ts':definition }, 'Checkbox.tsx')).not.toHaveProperty('palette.size.control');
  }
});
it('keeps quoted React style property identities when resolving aliased token bindings', () => {
  const source="import * as Check from '@radix-ui/react-checkbox'; import { tokens as palette } from './tokens'; export const Checkbox=(props:{checked?:boolean})=><Check.Root checked={props.checked} style={{'width':palette.size.control,'--control':palette.size.control}}/>;";
  expect(deriveCheckboxPreview(source,'Checkbox.tsx',[])?.inlineBindings).toEqual([{property:'width',token:'palette.size.control'},{property:'--control',token:'palette.size.control'}]);
});
