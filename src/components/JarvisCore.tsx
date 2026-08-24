import type { JarvisState } from "../types/jarvis";

const stateLabels: Record<JarvisState, string> = {
  idle: "READY",
  listening: "LISTENING",
  thinking: "PROCESSING",
  speaking: "RESPONDING",
  error: "SYSTEM ALERT",
};

export function JarvisCore({ state }: { state: JarvisState }) {
  return (
    <section className={`jarvis-core core-${state}`} aria-label={`Core status: ${stateLabels[state]}`}>
      <div className="core-coordinates">47° 23' 11.8" N <span>/</span> 08° 32' 24.7" E</div>
      <div className="core-stage">
        <svg viewBox="0 0 360 360" role="presentation">
          <defs>
            <filter id="softGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <circle className="core-guide guide-a" cx="180" cy="180" r="159" />
          <circle className="core-ring ring-outer" cx="180" cy="180" r="145" />
          <circle className="core-guide" cx="180" cy="180" r="126" />
          <circle className="core-ring ring-mid" cx="180" cy="180" r="112" />
          <circle className="core-ring ring-inner" cx="180" cy="180" r="83" />
          <circle className="core-guide" cx="180" cy="180" r="62" />
          <g className="ticks">
            {Array.from({ length: 36 }, (_, i) => (
              <line key={i} x1="180" y1="20" x2="180" y2={i % 3 === 0 ? "31" : "26"} transform={`rotate(${i * 10} 180 180)`} />
            ))}
          </g>
          <g className="orbiter"><circle cx="180" cy="34" r="3"/><circle className="orbit-faint" cx="180" cy="326" r="2"/></g>
          <path className="core-bracket" d="M116 146 L105 146 L105 162 M244 214 L255 214 L255 198" />
          <circle className="core-center" cx="180" cy="180" r="48" filter="url(#softGlow)" />
          <circle className="core-center-line" cx="180" cy="180" r="39" />
        </svg>
        <div className="core-copy"><strong>J</strong><small>CORE / MK I</small></div>
      </div>
      <div className="core-status"><span className="status-dot" />{stateLabels[state]}</div>
    </section>
  );
}
