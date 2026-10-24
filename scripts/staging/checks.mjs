const SHA = /^[a-f0-9]{40}$/;

export async function assertCurrentTarget(github, repo, target) {
  if (!SHA.test(target.sha) || !target.branch || target.branch === 'main') {
    throw new Error('A non-main branch and full commit SHA are required.');
  }
  const { data: ref } = await github.rest.git.getRef({ ...repo, ref: `heads/${target.branch}` });
  if (ref.object.sha !== target.sha) throw new Error('Branch head changed; deploy the new SHA.');
  const pulls = await github.paginate(github.rest.pulls.list, {
    ...repo, state: 'open', head: `${repo.owner}:${target.branch}`, per_page: 100,
  });
  for (const pr of pulls) {
    if (pr.head.repo?.full_name !== `${repo.owner}/${repo.repo}` || pr.head.sha !== target.sha) {
      throw new Error('PR head changed or belongs to another repository.');
    }
  }
}

export async function resolveTarget(github, context) {
  let branch;
  let sha;
  if (context.eventName === 'workflow_dispatch') {
    branch = context.payload.inputs?.branch;
    if (!branch || branch === 'main') throw new Error('Select a non-main branch.');
    ({ data: { object: { sha } } } = await github.rest.git.getRef({ ...context.repo, ref: `heads/${branch}` }));
  } else if (context.eventName === 'workflow_run') {
    const { data: run } = await github.rest.actions.getWorkflowRun({
      ...context.repo, run_id: context.payload.workflow_run.id,
    });
    const fullName = `${context.repo.owner}/${context.repo.repo}`;
    if (run.path !== '.github/workflows/staging-request.yml' || !['push', 'pull_request'].includes(run.event)
        || run.status !== 'completed' || run.conclusion !== 'success'
        || run.repository?.full_name !== fullName || run.head_repository?.full_name !== fullName
        || !run.head_branch || run.head_branch === 'main' || !SHA.test(run.head_sha)) return null;

    // 要求時のブランチ先端を固定し、PRのマージ用SHAや新しい先端へ置き換えない。
    branch = run.head_branch;
    sha = run.head_sha;
  } else {
    throw new Error('Unsupported deployment event.');
  }
  const target = { branch, sha };
  await assertCurrentTarget(github, context.repo, target);
  return target;
}
