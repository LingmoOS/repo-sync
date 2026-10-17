import type { SiteConfig } from '../../shared/packages'
import { CopyButton, Icon } from './UI'

export default function SetupCard({ config, suite }: { config: SiteConfig; suite: string }) {
  const base = config.publicUrl || window.location.origin + '/api/file'
  const steps = [
    {
      title: '导入仓库签名公钥',
      description: '保存公钥到独立的 keyring 文件。',
      command:
        'sudo install -d -m 0755 /etc/apt/keyrings\ncurl -fsSL ' +
        base +
        '/keys/lingmo.asc | sudo gpg --dearmor --yes -o /etc/apt/keyrings/lingmo.gpg\nsudo chmod 0644 /etc/apt/keyrings/lingmo.gpg',
    },
    {
      title: '添加 Lingmo 软件源',
      description: '当前选择的发行分支：' + suite,
      command:
        "echo 'deb [signed-by=/etc/apt/keyrings/lingmo.gpg] " +
        base +
        ' ' +
        suite +
        " main' | sudo tee /etc/apt/sources.list.d/lingmo.list",
    },
    {
      title: '更新软件包列表',
      description: '完成后即可使用 apt install 安装软件包。',
      command: 'sudo apt update',
    },
  ]
  return (
    <section className="setup-page">
      <div className="eyebrow">GET STARTED</div>
      <h1>让软件包触手可及。</h1>
      <p className="page-intro">将 Lingmo 仓库添加到 APT，即可从终端安装和更新软件包。</p>
      <div className="notice">
        <Icon name="box" />
        <p>适用于与此仓库兼容的 Lingmo / Debian 系统。请选择适合系统的发行分支。</p>
      </div>
      {!config.signingKey ? (
        <div className="empty-state">
          <h3>仓库签名公钥尚未发布</h3>
          <p>请先在同步配置中启用 GPG 签名并发布公钥，再接入 APT 软件源。</p>
        </div>
      ) : (
        <div className="setup-steps">
          {steps.map((step, i) => (
            <section key={step.title}>
              <span className="step-number">0{i + 1}</span>
              <div>
                <h2>{step.title}</h2>
                <p className="muted">{step.description}</p>
                <div className="command">
                  <code>{step.command}</code>
                  <CopyButton text={step.command} />
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
