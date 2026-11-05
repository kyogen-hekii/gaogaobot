const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => new Date(value).toLocaleString('ja-JP');
const names = {active:'進めています',completed:'確認を終えました',blocked:'判断が必要です',exhausted:'回数の上限です',expired:'時間の上限です',revoked:'停止しました',superseded:'条件が更新されました',interrupted:'前回の実行を照合してください'};
export function delegationPanel(data, work) {
  if(globalThis.__SHIORI_PREVIEW__)return '<div class="notice">継続して仕事を任せる操作は、ローカルサーバー版で利用できます。この画面は保存されない操作プレビューです。</div>';
  const delegation = (data.delegations || []).findLast(d => d.workId === work.id);
  const review = (data.reviews || []).findLast(r => r.workId === work.id && r.workRevision === work.revision);
  const busy = data.jobs.some(j => j.workId === work.id && ['queued','running','cancel_requested'].includes(j.status));
  const canStart = !['done','canceled'].includes(work.status) && delegation?.status !== 'active';
  return `<section class="delegation-panel"><h3>しおりに任せる</h3>${delegation ? `<p><b>${esc(names[delegation.status] || delegation.status)}</b></p><p>${delegation.usedRuns} / ${delegation.maxRuns}回 · ${delegation.mode === 'read' ? '読取り' : '許可された変更'}<br/>期限 ${esc(date(delegation.expiresAt))}</p><progress max="${delegation.maxRuns}" value="${delegation.usedRuns}" aria-label="使用した実行回数"></progress>${delegation.reason ? `<p>${esc(delegation.reason)}</p>` : ''}` : '<p>範囲を決めて一度任せると、結果の確認と不足分の追加作業まで続けます。</p>'}
    ${delegation?.status === 'active' ? `<button class="btn" data-action="stop-delegation" data-id="${esc(work.id)}">任せた仕事を停止</button>` : ''}
    ${canStart ? `<button class="btn primary" data-action="delegate" data-id="${esc(work.id)}" ${busy ? 'disabled' : ''}>${delegation ? '条件を確認して任せ直す' : 'この仕事を任せる'}</button>` : ''}
    ${review ? `<div class="review-summary"><h3>条件ごとの確認</h3><p>${esc(review.summary)}</p>${review.criteria.map(c => `<div class="criterion"><b>${c.status === 'met' ? '確認済み' : c.status === 'unmet' ? '不足' : '未確認'} · ${esc(work.acceptance[c.index])}</b><p>${esc(c.evidence)}</p></div>`).join('')}<small>AIの確認結果です。最後の受け入れはあなたが行います。</small></div>` : ''}</section>`;
}

export function delegationForm(data, work) {
  const provider=data.providers.find(p=>p.id===data.settings.outerProvider);
  const score=r=>(r.kind===provider?.kind?0:2)+(r.allowWrite?1:0);
  const runners = data.runners.filter(r => r.enabled).sort((a,b)=>score(a)-score(b));
  return `<form id="delegation-form" data-id="${esc(work.id)}" data-revision="${work.revision}">
    <p>「${esc(work.title)}」の目的と条件を引き継ぎます。指定した範囲内では、追加の確認なしで作業と結果の評価を続けます。</p>
    <label>仕事場<select name="runnerId" required>${runners.map(r => `<option value="${esc(r.id)}">${esc(r.label)}${r.kind === 'demo' ? '（模擬実行）' : ''}</option>`).join('')}</select></label>
    <label>依頼内容<textarea name="instruction" required maxlength="12000">${esc(work.objective)}\n受け入れ条件と照合し、不足があれば範囲内で補ってください。</textarea></label>
    <label>任せる範囲<select name="mode"><option value="read">調査・読取りのみ</option>${runners.some(r => r.allowWrite) ? '<option value="write">仕事場で許可した変更作業</option>' : ''}</select></label>
    <div class="delegation-limits"><label>最大実行回数<input name="maxRuns" type="number" min="1" max="20" value="3" required></label><label>有効時間（分）<input name="minutes" type="number" min="1" max="1440" value="60" required></label></div>
    <div class="notice">失敗・範囲変更・上限到達で停止します。公開・外部送信・本番操作は含みません。実行後の成果と未確認事項を残します。</div>
    <div class="dialog-actions"><button type="button" class="btn" data-action="close-modal">戻る</button><button class="btn primary" ${runners.length ? '' : 'disabled'}>この範囲で任せて開始</button></div>
  </form>`;
}
