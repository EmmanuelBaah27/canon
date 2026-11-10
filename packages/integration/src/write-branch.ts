import type { IntegrationService } from './approval';
import { git, isolatedWorktree, publishBranch } from './worktree';
import { assertApprovedFiles, assertApprovedTree, verifyCheckout, verificationTimeout, type VerificationOptions, type VerificationReport } from './verify';
export interface BranchResult { branchName: string; commit: string; verification: VerificationReport; notices: string[] }
/** Reverify the exact approved patch; publish only a new local ref after final preflight. */
export async function writeApprovedBranch(service: IntegrationService, approvalId: string, options: VerificationOptions = {}): Promise<BranchResult> {
  verificationTimeout(options); const { proposal, approval } = await service.assertCurrent(approvalId), source = await service.sourceRoot();
  return isolatedWorktree(source, proposal, async (root) => {
    const verification = await verifyCheckout(root, proposal, options);
    if (!verification.passed) throw new Error('Repository verification failed; source branch was not written');
    await assertApprovedFiles(root, proposal);
    let commit = proposal.baseCommit;
    if (proposal.changes.length) {
      await git(root, ['add', '--', ...proposal.changes.map((change) => change.path)]);
      await assertApprovedTree(root, proposal, (await git(root, ['write-tree'])).trim());
      // Explicit fixed author and approval timestamp keep output independent of local identity/config.
      await git(root, ['-c', 'user.name=BYOL', '-c', 'user.email=byol@localhost', 'commit', '--no-verify', '--date', approval.approvedAt, '-m', `Integrate approved BYOL draft ${proposal.draftId} revision ${proposal.draftRevision}`], approval.approvedAt);
      commit = (await git(root, ['rev-parse', 'HEAD'])).trim();
    }
    await assertApprovedTree(root, proposal, commit);
    await service.assertCurrent(approvalId);
    const remotes = (await git(source, ['remote'])).trim();
    const notices = ['Created a local source branch. V1 does not push branches or create pull requests.'];
    if (!remotes) notices.push('No remote is configured.');
    // Source objects are imported only after every preflight and verification check passes.
    // No FETCH_HEAD, remote-tracking ref, checkout, index, hook, push or PR side effect.
    await publishBranch(source, root, proposal, commit, async () => {
      const current = await service.assertCurrent(approvalId);
      const release = await service.drafts.acquireIntegrationLease(current.proposal.draftId, current.proposal.draftRevision);
      return { assertCurrent: () => service.assertLiveCurrent(current.proposal), release };
    });
    return { branchName: proposal.branchName, commit, verification, notices };
  });
}
