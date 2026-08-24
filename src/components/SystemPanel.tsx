import type { AIProviderName, SystemItem, VoiceProviderName, VoiceStatus } from "../types/jarvis";
import type { RuntimeTarget } from "../services/runtime";
interface Props { runtimeTarget: RuntimeTarget; aiConfigured: boolean; aiProvider: AIProviderName; voiceProvider?: VoiceProviderName; voiceStatus: VoiceStatus; }
export function SystemPanel({ runtimeTarget, aiConfigured, aiProvider, voiceProvider, voiceStatus }: Props) {
  const web = runtimeTarget === "web";
  const voice = {
    online: { value: web ? "ONLINE" : voiceProvider?.toUpperCase() ?? "ONLINE", level: "connected" as const },
    blocked: { value: "BLOCKED", level: "unavailable" as const },
    error: { value: "ERROR", level: "unavailable" as const },
    limited: { value: "LIMITED", level: "unavailable" as const },
    unavailable: { value: "UNAVAILABLE", level: "unavailable" as const },
  }[voiceStatus];
  const networkOnline = navigator.onLine;
  const items: SystemItem[] = [
    { label: "CORE", value: "ONLINE", level: "online" },
    { label: "AI", value: aiProvider.toUpperCase(), level: aiConfigured ? "connected" : "unavailable" },
    { label: "NETWORK", value: networkOnline ? "ONLINE" : "OFFLINE", level: networkOnline ? "online" : "unavailable" },
    { label: "VOICE", ...voice },
    { label: "TOOLS", value: web ? "WEB ONLY" : "LOCKED", level: "locked" },
  ];
  return (
    <aside className="system-panel">
      <div className="panel-heading"><span>SYSTEM</span><span>SYS.02.1</span></div>
      <div className="diagnostic-line" />
      <div className="system-items">{items.map((item, index) => (
        <div className="system-row" key={item.label}><span className="row-index">0{index + 1}</span><span className="system-label">{item.label}</span><span className={"system-value " + item.level}>{item.value}</span></div>
      ))}</div>
      <div className="signal-block" aria-hidden="true">{[35,60,45,85,55,70,40,65,48,80,52,68].map((height,index)=><i key={index} style={{height: height + "%"}}/>)}</div>
      <div className="panel-foot">{web ? "SECURE WEB INTERFACE" : "SECURE LOCAL INTERFACE"}</div>
    </aside>
  );
}