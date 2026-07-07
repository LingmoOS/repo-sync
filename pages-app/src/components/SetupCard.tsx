export default function SetupCard() {
  const sources = `deb https://repo.lingmos.org stable main`

  return (
    <div className="setup-card">
      <div className="setup-header">
        <div className="setup-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <span className="setup-title">Quick Setup</span>
      </div>

      <div className="setup-body">
        <p className="setup-desc">
          Add Lingmo OS repository to your APT sources:
        </p>

        <div className="setup-steps">
          <div className="step">
            <span className="step-num">1</span>
            <div className="step-content">
              <div className="step-label">Add repository source</div>
              <div className="code-block">
                <code>{sources}</code>
                <CopyButton text={sources} />
              </div>
            </div>
          </div>

          <div className="step">
            <span className="step-num">2</span>
            <div className="step-content">
              <div className="step-label">Import GPG key &amp; update</div>
              <div className="code-block">
                <code>{`curl -fsSL https://repo.lingmos.org/lingmo.gpg | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/lingmo.gpg\nsudo apt update`}</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .setup-card {
          background: linear-gradient(135deg, rgba(79,142,247,0.06) 0%, rgba(163,113,247,0.04) 100%);
          border: 1px solid rgba(79,142,247,0.2);
          border-radius: var(--radius-lg);
          margin-bottom: 20px;
          overflow: hidden;
        }
        .setup-header {
          display: flex; align-items: center; gap: 8px;
          padding: 14px 18px 12px;
          border-bottom: 1px solid rgba(79,142,247,0.12);
        }
        .setup-icon {
          width: 28px; height: 28px; border-radius: var(--radius-sm);
          background: rgba(79,142,247,0.15); border: 1px solid rgba(79,142,247,0.25);
          display: flex; align-items: center; justify-content: center;
          color: var(--accent); flex-shrink: 0;
        }
        .setup-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .setup-body { padding: 14px 18px 16px; }
        .setup-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 14px; }
        .setup-steps { display: flex; flex-direction: column; gap: 12px; }
        .step { display: flex; gap: 12px; align-items: flex-start; }
        .step-num {
          width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; margin-top: 1px;
          background: rgba(79,142,247,0.15); border: 1px solid rgba(79,142,247,0.3);
          color: var(--accent); font-size: 11px; font-weight: 600;
          display: flex; align-items: center; justify-content: center;
        }
        .step-content { flex: 1; min-width: 0; }
        .step-label { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
        .code-block {
          background: var(--surface-0); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 10px 12px;
          display: flex; align-items: flex-start; gap: 10px; overflow-x: auto;
        }
        .code-block code {
          font-family: var(--font-mono); font-size: 12px; color: var(--text-primary);
          white-space: pre; flex: 1;
        }
      `}</style>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {})
  }
  return (
    <button className="copy-btn" onClick={copy} title="Copy">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      <style>{`
        .copy-btn {
          background: none; border: none; color: var(--text-muted); cursor: pointer;
          padding: 2px; border-radius: 4px; display: flex; flex-shrink: 0; margin-top: 1px;
          transition: color 0.15s;
        }
        .copy-btn:hover { color: var(--accent); }
      `}</style>
    </button>
  )
}
