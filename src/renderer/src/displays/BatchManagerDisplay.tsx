import { useState } from 'react'
import { alertResult } from '../components/LibraryExplorer'
import { useExecutive } from '../engine/executive'
import { useStore } from '../engine/store'

/** DeltaV Batch Application Manager (p10-37): start and stop the Batch Executive service and verify its phases. */
export function BatchManagerDisplay(): JSX.Element {
  const x = useExecutive()
  const time = useStore(s => s.time)
  const [tab, setTab] = useState<'Batch Executive' | 'Campaign Manager'>('Batch Executive')
  const running = x.service === 'RUNNING'
  const batchCount = x.batches.length
  const prompts = x.prompts.filter(p => !p.answered).length
  const messages = x.journal.slice(-8).reverse()
  return <div className="display bam" data-display="BatchApplicationManager">
    <div className="rs-title">DeltaV Batch Application Manager</div>
    <div className="boi-tabs" role="tablist">{(['Batch Executive', 'Campaign Manager'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === 'Campaign Manager' ? <p className="exp-hint bam-pad">The Campaign Manager is not simulated in BatchLive.</p> : <div className="bam-body">
      <fieldset className="bam-box"><legend>Administer</legend>
        <select aria-label="Administer" defaultValue="PROPLUS"><option value="PROPLUS">PROPLUS</option></select>
        <div className="bam-buttons"><button className="tbtn sm" disabled={running} onClick={() => alertResult(x.startService())}>Start</button>
          <button className="tbtn sm" disabled={!running} onClick={() => alertResult(x.stopService())}>Stop</button><button className="tbtn sm" disabled>Advanced</button></div></fieldset>
      <fieldset className="bam-box"><legend>Batch Executive Status - PROPLUS</legend>
        <dl className="bam-status"><dt>Started At:</dt><dd data-bam="started">{x.startedAt === null ? 'n/a' : new Date(x.startedAt).toLocaleString('en-US')}</dd>
          <dt>Service Status:</dt><dd data-bam="service" aria-label="Service status">{x.service}</dd>
          <dt>Version:</dt><dd>{running ? '7.4 (BatchLive)' : 'n/a'}</dd>
          <dt>Connected Clients:</dt><dd>{running ? 1 : 'n/a'}</dd>
          <dt>Batch Count:</dt><dd data-bam="batches">{running ? batchCount : 'n/a'}</dd>
          <dt>Prompts Count:</dt><dd>{running ? prompts : 'n/a'}</dd></dl></fieldset>
      <fieldset className="bam-box"><legend>Phase Server(s) Status</legend><table className="dvx-details"><thead><tr><th>Server</th><th>Status</th></tr></thead>
        <tbody>{running ? <tr><td>CTLR1</td><td>Running</td></tr> : null}</tbody></table></fieldset>
      <fieldset className="bam-box"><legend>Phase Verification</legend>
        <dl className="bam-status"><dt>Total Phase Count:</dt><dd data-bam="total" aria-label="Total phase count">{x.verify ? x.verify.total : 'n/a'}</dd>
          <dt>Bad Phase Count:</dt><dd data-bam="bad" aria-label="Bad phase count">{x.verify ? x.verify.bad : 'n/a'}</dd></dl>
        <button className="tbtn sm" disabled={!running} onClick={() => alertResult(x.verifyPhases())}>Verify Phases</button>
        <table className="dvx-details" aria-label="Bad phases"><thead><tr><th>Phase</th><th>Status</th></tr></thead>
          <tbody>{(x.verify?.bads ?? []).map(b => <tr key={b}><td>{b.split(': ')[0]}</td><td>{b.split(': ').slice(1).join(': ')}</td></tr>)}</tbody></table></fieldset>
      <fieldset className="bam-box bam-wide"><legend>Messages</legend>{messages.map((m, i) => <div key={i}>{new Date(m.at).toLocaleTimeString('en-US')} {m.text}</div>)}<small>{new Date(time).toLocaleTimeString('en-US')}</small></fieldset>
    </div>}
  </div>
}
