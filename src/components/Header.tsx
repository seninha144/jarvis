import { Activity } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="app-header">
      <div className="brand-block">
        <div className="eyebrow"><span>01</span> PERSONAL INTELLIGENCE SYSTEM</div>
        <h1>J.A.R.V.I.S.</h1>
      </div>
      <div className="header-telemetry">
        <div className="clock">{now.toLocaleTimeString([], { hour12: false })}</div>
        <div className="online-indicator"><Activity size={13} /> SYSTEM ONLINE</div>
      </div>
    </header>
  );
}
