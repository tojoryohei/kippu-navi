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
    if (run.path !== '.github/workflows/staging-request.yml' || run.conclusion !== 'success'
        || run.head_repository?.full_name !== `${context.repo.owner}/${context.repo.repo}`
        || !['push', 'pull_request'].includes(run.event)) {
      throw new Error('Not a successful same-repository staging request.');
    }
    branch = run.head_branch;
    // workflow_run.head_sha is the source head, NOT refs/pull/N/merge.
    sha = run.head_sha;
  } else {
    throw new Error('Unsupported deployment event.');
  }
  const target = { branch, sha };
  await assertCurrentTarget(github, context.repo, target);
  return target;
}

export async function publishResult(github, repo, { checkId, sha, current, results }) {
  const { data: check } = await github.rest.checks.get({ ...repo, check_run_id: checkId });
  if (check.head_sha !== sha || check.name !== 'Staging verification') {
    throw new Error('Check identity mismatch.');
  }
  const success = current && ['resolve', 'pending', 'frontend', 'api', 'verify']
    .every(job => results[job]?.result === 'success');
  await github.rest.checks.update({
    ...repo, check_run_id: checkId, status: 'completed',
    conclusion: success ? 'success' : 'failure',
    output: {
      title: success ? 'staging検証成功' : 'staging検証失敗・再実行が必要',
      summary: `対象SHA: ${sha}\n最新head: ${current}\n${JSON.stringify(results)}`,
    },
  });
  if (!success) throw new Error('Staging verification did not pass for the current head.');
}
