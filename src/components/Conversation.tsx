import { useEffect, useRef } from "react";
import type { Message } from "../types/jarvis";

export function Conversation({ messages }: { messages: Message[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  return (
    <section className="conversation" aria-label="Conversation history">
      <div className="conversation-head"><span>CONVERSATION LOG</span><span>{String(messages.length).padStart(2, "0")} ENTRIES</span></div>
      <div className="message-list">
        {messages.map((message) => (
          <article className={`message message-${message.role} ${message.error ? "message-error" : ""}`} key={message.id}>
            <div className="message-meta">
              <span>{message.role === "user" ? "YOU" : "JARVIS"}</span>
              <time>{message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</time>
            </div>
            <div className="message-content">{message.content}{message.pending && <span className="typing-cursor" />}</div>
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
