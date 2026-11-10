export { connectRepository, type ConnectRepositoryInput, type ConnectRepositoryOptions } from './connect';
export { discoverComponents, buildComponentManifest, type DiscoveredComponent } from './discover';
export { resolveRepositoryPath } from './safe-path';
export { readComponentEvidence } from './discover';
export { parseCssSource } from './css-source';
export {
  approveDesignSystemProposal,
  discoverDesignSystem,
  getApprovedDesignSystem,
  type ApproveDesignSystemProposalInput,
} from './design-system';
