import type {
  ComponentManifest,
  Draft,
  Issue,
  PreviewOverride,
  RepositoryConnection,
} from "@byol/core";
import type { TokenValue } from "./source-evidence";
import type { DerivedControl } from "./control-derivation";
export interface CanvasDraft {
  /** Current-session link for an existing or recovered draft. */
  launchUrl?: string;
  draft: Draft;
  manifest: ComponentManifest;
  controls: DerivedControl[];
  values: Record<string, unknown>;
  overrides: PreviewOverride[];
  ready: boolean;
  source: Record<string, string>;
  tokenValues?: Record<string, TokenValue>;
  sourceManifest?: ComponentManifest;
  inlineBindings?: { property: string; token: string }[];
  preview?: {
    kind: "checkbox";
    forwardedStates: ("checked" | "disabled")[];
    wrapperForwardedStates: ("checked" | "disabled")[];
    stateDefaults: { checked: boolean; disabled: boolean };
    inlineBindings?: { property: string; token: string }[];
    className?: string;
    imagePath?: string;
    imageAlt?: string;
    wrapped?: boolean;
    wrapperClassName?: string;
    imageWidth?: number;
    imageHeight?: number;
    text?: string;
  };
}
export interface RuntimeState {
  /** Creation-only, authenticated fragment handoff to the exact existing draft. */
  openedDraftId?: string;
  launchUrl?: string;
  connection?: RepositoryConnection;
  components: { id: string; name: string; source: { path: string } }[];
  drafts: CanvasDraft[];
  issues: Issue[];
}
