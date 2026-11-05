import { assert, id, now, text } from './store.mjs';

const live = ['queued', 'running', 'cancel_requested'];
export const currentDelegation = (store, workId) => store.list('delegations').findLast(d => d.workId === workId);

export function validateDelegation(engine, delegation, work, profile) {
  assert(delegation?.status === 'active', 'この仕事への委任は停止しています。', 409, 'DELEGATION_STOPPED');
  assert(delegation.workId === work.id && delegation.workRevision === work.revision,
    '仕事の条件が変わりました。範囲を確認して任せ直してください。', 409, 'DELEGATION_STALE');
  assert(delegation.profileId === profile.id && delegation.profileFingerprint === profile.fingerprint,
    '実行先の設定が変わりました。任せ直してください。', 409, 'PROFILE_CHANGED');
  assert(Date.parse(delegation.expiresAt) > Date.now(), '任せた時間の上限に達しました。', 409, 'DELEGATION_EXPIRED');
  assert(!['done', 'canceled'].includes(work.status), 'この仕事は終了しています。', 409, 'WORK_CLOSED');
  assert(delegation.mode !== 'write' || profile.allowWrite, '変更作業は許可されていません。', 403, 'WRITE_DISABLED');
}

export function enqueueDelegated(engine, delegation, instruction) {
  const s = engine.s;
  const work = s.must('works', delegation.workId);
  const profile = engine.profile('inner', delegation.profileId);
  validateDelegation(engine, delegation, work, profile);
  assert(delegation.usedRuns < delegation.maxRuns, '任せた実行回数の上限に達しました。', 409, 'DELEGATION_LIMIT');
  assert(!s.list('jobs').some(j => j.workId === work.id && j.role === 'inner' && live.includes(j.status)),
    'この仕事は実行中です。', 409, 'BUSY');
  const job = engine.enqueue('inner', {
    workId: work.id, conversationId: work.conversationId, profileId: profile.id,
    prompt: text(instruction, '依頼内容', 12000), mode: delegation.mode,
    workRevision: work.revision, delegationId: delegation.id,
  });
  delegation.usedRuns++;
  s.put('delegations', delegation);
  work.status = 'queued'; work.updatedAt = now(); s.put('works', work);
  s.event('delegation.dispatched', { title: `任せた範囲で実行します（${delegation.usedRuns}/${delegation.maxRuns}回）`, jobId: job.id, delegationId: delegation.id }, work.id);
  return job;
}

export function delegateWork(engine, workId, body) {
  const result = engine.s.transaction(() => {
    const s = engine.s, work = s.must('works', workId);
    assert(body.revision === work.revision, '仕事の条件が更新されています。', 409, 'REVISION_CONFLICT');
    assert(!s.list('jobs').some(j => j.workId === workId && live.includes(j.status)), '関連する処理の終了を待ってください。', 409, 'BUSY');
    const profile = engine.profile('inner', body.runnerId);
    assert(['read', 'write'].includes(body.mode), '作業範囲を選択してください。');
    assert(Number.isInteger(body.maxRuns) && body.maxRuns >= 1 && body.maxRuns <= 20, '実行回数は1〜20回です。');
    assert(Number.isInteger(body.minutes) && body.minutes >= 1 && body.minutes <= 1440, '有効時間は1〜1440分です。');
    const instruction = text(body.instruction, '依頼内容', 12000);
    const previous = currentDelegation(s, workId);
    if (previous?.status === 'active') { previous.status = 'superseded'; s.put('delegations', previous); }
    const delegation = {
      id: id('delegation_'), workId, workRevision: work.revision, profileId: profile.id,
      profileFingerprint: profile.fingerprint, mode: body.mode, maxRuns: body.maxRuns, usedRuns: 0,
      instruction, status: 'active', createdAt: now(), expiresAt: new Date(Date.now() + body.minutes * 60000).toISOString(),
    };
    s.put('delegations', delegation);
    for (const a of s.list('approvals')) if (a.workId === workId && a.status === 'pending') { a.status = 'superseded'; s.put('approvals', a); }
    s.put('decisions', { id: id('dec_'), workId, actor: 'human', kind: 'delegation', at: now(), revision: work.revision,
      delegationId: delegation.id, text: instruction, mode: body.mode, maxRuns: body.maxRuns, expiresAt: delegation.expiresAt });
    const job = enqueueDelegated(engine, delegation, instruction);
    engine.message(work.conversationId, 'assistant',
      `「${work.title}」を引き受けました。${profile.label || profile.id}で${body.mode === 'read' ? '調査・読取り' : '許可された変更作業'}を最大${body.maxRuns}回進め、結果を確認します。期限は${delegation.expiresAt}です。途中で止めることもできます。`, { workId });
    return { delegation, job };
  });
  engine.changed(); void engine.pump(); return result;
}

export function stopDelegation(engine, workId, reason = '利用者が停止しました。', status = 'revoked') {
  const d = currentDelegation(engine.s, workId);
  if (!d || d.status !== 'active') return d;
  d.status = status; d.reason = reason; d.stoppedAt = now(); engine.s.put('delegations', d);
  // Cancel both the worker and its pending review so a stale result cannot restart work.
  for (const j of engine.s.list('jobs')) if (j.delegationId === d.id && live.includes(j.status)) engine.cancel(j.id);
  engine.s.event('delegation.stopped', { title: reason, delegationId: d.id }, workId);
  const work=engine.s.must('works',workId);
  engine.message(work.conversationId,'assistant',`任せた仕事を停止しました。${reason}`,{workId});
  engine.changed(); return d;
}

export function recordReview(engine, review, job) {
  assert(job.trigger === 'result' && job.workId, '結果の確認時だけレビューを保存できます。');
  const s = engine.s, work = s.must('works', job.workId);
  assert(job.workRevision === undefined || job.workRevision === work.revision, '条件変更前の結果は評価できません。', 409, 'REVIEW_STALE');
  const indices = new Set(review.criteria.map(c => c.index));
  assert(review.criteria.length === work.acceptance.length && indices.size === work.acceptance.length &&
    work.acceptance.every((_, i) => indices.has(i)), 'すべての受け入れ条件を一度ずつ評価してください。');
  assert(review.verdict !== 'ready' || review.criteria.every(c => c.status === 'met'), '未達・未確認の条件が残っています。');
  const artifact = s.must('artifacts', job.resultArtifactId);
  assert(artifact.workId === work.id, '別の仕事の成果物は評価できません。');
  assert(artifact.source !== 'demo' || review.criteria.every(c => c.status !== 'met'), 'デモ結果を実作業の達成根拠として扱えません。');
  const worker = s.must('jobs', artifact.runId);
  assert(review.verdict !== 'ready' || !worker.denials?.length, '権限不足が残っています。');
  const saved = { ...review, id: id('review_'), workId: work.id, workRevision: work.revision,
    artifactId: artifact.id, jobId: job.id, createdAt: now(), source: 'outer' };
  s.put('reviews', saved);
  s.event('review.recorded', { title: review.verdict === 'ready' ? '成果を確認しました。受け入れをお願いします' : review.verdict === 'blocked' ? '判断が必要な点があります' : '不足を確認しました', reviewId: saved.id }, work.id);
  const d = job.delegationId ? s.get('delegations', job.delegationId) : null;
  if (d?.status === 'active' && (review.verdict !== 'needs_work' || d.usedRuns >= d.maxRuns)) {
    d.status = review.verdict === 'ready' ? 'completed' : review.verdict === 'blocked' ? 'blocked' : 'exhausted';
    d.reason = review.verdict === 'needs_work' ? '実行回数の上限に達しました。' : review.summary;
    d.stoppedAt = now(); s.put('delegations', d);
  }
  work.status = review.verdict === 'blocked' || worker.denials?.length ? 'blocked' : 'review'; s.put('works', work);
  return saved;
}

export function dispatchFromPlan(engine, action, job, review) {
  const d = currentDelegation(engine.s, action.workId);
  if (!job.delegationId) return null; // ordinary proposals still use one-time approval
  assert(d?.id === job.delegationId, '以前の委任に対する提案です。', 409, 'DELEGATION_STALE');
  if (d.status !== 'active') return { stopped: true, reason: d.reason || '委任が停止しています。' };
  assert(job.workId === action.workId, '任せた仕事の範囲を超えています。');
  if (job.trigger === 'result') assert(review?.verdict === 'needs_work', '不足の評価がない継続実行はできません。');
  if (action.runnerId !== d.profileId || (action.mode || 'read') !== d.mode) {
    d.status = 'blocked'; d.reason = '実行先または作業範囲の変更が必要です。'; engine.s.put('delegations', d);
    const work=engine.s.must('works',action.workId);work.status='blocked';engine.s.put('works',work);
    engine.s.event('delegation.scope_changed', { title: d.reason }, action.workId);
    return { stopped: true, reason: d.reason };
  }
  if (d.usedRuns >= d.maxRuns || Date.parse(d.expiresAt) <= Date.now()) {
    d.status = d.usedRuns >= d.maxRuns ? 'exhausted' : 'expired';
    d.reason = '任せた回数または時間の上限に達しました。'; engine.s.put('delegations', d);
    return { stopped: true, reason: d.reason };
  }
  return enqueueDelegated(engine, d, action.instruction);
}
