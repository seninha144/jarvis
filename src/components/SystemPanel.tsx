import type { SystemItem, VoiceStatus } from "../types/jarvis";

interface Props { aiConfigured: boolean; voiceStatus: VoiceStatus; }

export function SystemPanel({ aiConfigured, voiceStatus }: Props) {
  const voice = {
    online: { value: "ONLINE", level: "connected" as const },
    blocked: { value: "BLOCKED", level: "unavailable" as const },
    error: { value: "ERROR", level: "unavailable" as const },
    unavailable: { value: "UNAVAILABLE", level: "unavailable" as const },
  }[voiceStatus];
  const items: SystemItem[] = [
    { label: "CORE", value: "ONLINE", level: "online" },
    { label: "AI", value: aiConfigured ? "CONNECTED" : "OFFLINE", level: aiConfigured ? "connected" : "unavailable" },
    { label: "NETWORK", value: "ONLINE", level: "online" },
    { label: "VOICE", ...voice },
    { label: "TOOLS", value: "LOCKED", level: "locked" },
  ];

  return (
    <aside className="system-panel">
      <div className="panel-heading"><span>SYSTEM</span><span>SYS.02</span></div>
      <div className="diagnostic-line" />
      <div className="system-items">
        {items.map((item, index) => (
          <div className="system-row" key={item.label}>
            <span className="row-index">0{index + 1}</span>
            <span className="system-label">{item.label}</span>
            <span className={`system-value ${item.level}`}>{item.value}</span>
          </div>
        ))}
      </div>
      <div className="signal-block" aria-hidden="true">
        {[35, 60, 45, 85, 55, 70, 40, 65, 48, 80, 52, 68].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}
      </div>
      <div className="panel-foot">SECURE LOCAL INTERFACE</div>
    </aside>
  );
}