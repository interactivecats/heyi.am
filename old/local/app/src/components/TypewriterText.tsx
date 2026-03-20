import { useState, useEffect, useRef } from "react";

interface Props {
  /** The text to type out */
  text: string;
  /** Milliseconds per character (default 15) */
  speed?: number;
  /** Delay before starting (ms, default 0) */
  delay?: number;
  /** CSS class for the container */
  className?: string;
  /** Called when typing completes */
  onComplete?: () => void;
  /** Tag to render as (default "span") */
  as?: keyof React.JSX.IntrinsicElements;
}

export default function TypewriterText({
  text,
  speed = 15,
  delay = 0,
  className,
  onComplete,
  as: Tag = "span",
}: Props) {
  const [charIndex, setCharIndex] = useState(0);
  const animRef = useRef<number | null>(null);
  const completeCalled = useRef(false);

  useEffect(() => {
    setCharIndex(0);
    completeCalled.current = false;

    let started = false;
    const startTimer = setTimeout(() => { started = true; }, delay);
    let lastTime = 0;

    function tick(timestamp: number) {
      if (!started) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      if (timestamp - lastTime < speed) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTime = timestamp;

      setCharIndex(prev => {
        const next = prev + 1;
        if (next >= text.length) {
          if (!completeCalled.current) {
            completeCalled.current = true;
            onComplete?.();
          }
          return text.length;
        }
        return next;
      });

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);

    return () => {
      clearTimeout(startTimer);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [text, speed, delay, onComplete]);

  const visible = text.slice(0, charIndex);
  const cursor = charIndex < text.length ? "▎" : "";

  const Component = Tag as any;
  return <Component className={className}>{visible}<span className="typewriter-cursor">{cursor}</span></Component>;
}
