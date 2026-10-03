/** App URLs that carry a repository. Issue numbers repeat across repositories, so bounties need both. */
export const paths = {
  bounty: (repo: string, issueNumber: number) => `/bounties/${encodeURIComponent(repo)}/${issueNumber}`,
  repoBounties: (repo: string) => `/bounties?repo=${encodeURIComponent(repo)}`,
  repoDashboard: (repo: string) => `/dashboard/repos/${encodeURIComponent(repo)}`,
  /** The same form either way; a repository in the query pre-selects it. */
  newBounty: (repo?: string) => (repo ? `/dashboard/new?repo=${encodeURIComponent(repo)}` : '/dashboard/new'),
};
