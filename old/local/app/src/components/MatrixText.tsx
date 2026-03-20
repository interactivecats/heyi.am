import { useState, useEffect, useRef } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&";
const WINDOW_SIZE = 4;

interface Props {
  text: string;
  /** ms per character resolve (default 20) */
  speed?: number;
  /** Random flicker cycles before each char locks (default 3) */
  flickers?: number;
  className?: string;
  onComplete?: () => void;
}

function randomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

export default function MatrixText({
  text,
  speed = 20,
  flickers = 3,
  className,
  onComplete,
}: Props) {
  const [resolved, setResolved] = useState(0);
  const [scrambleChars, setScrambleChars] = useState("");
  const [cursorChar, setCursorChar] = useState("");
  const animRef = useRef<number | null>(null);
  const stateRef = useRef({ pos: 0, flick: 0, done: false });
  // Track what text we're animating so we don't reset on re-renders
  // that don't actually change the text content
  const prevTextRef = useRef("");

  useEffect(() => {
    const s = stateRef.current;

    // If text hasn't changed, don't restart
    if (text === prevTextRef.current) return;

    // If text grew (streaming partial), continue from current position
    if (text.startsWith(prevTextRef.current) && s.pos > 0 && !s.done) {
      prevTextRef.current = text;
      return; // animation loop is already running, it'll pick up new length
    }

    // Text is genuinely new — reset and start fresh
    prevTextRef.current = text;
    s.pos = 0;
    s.flick = 0;
    s.done = false;
    setResolved(0);
    setCursorChar("");
    setScrambleChars("");

    let lastTime = 0;

    function tick(timestamp: number) {
      if (s.done) return;

      if (timestamp - lastTime < speed) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTime = timestamp;

      const currentText = prevTextRef.current;

      // Skip spaces instantly
      while (s.pos < currentText.length && currentText[s.pos] === " ") {
        s.pos++;
        s.flick = 0;
      }

      if (s.pos >= currentText.length) {
        s.done = true;
        setResolved(currentText.length);
        setCursorChar("");
        setScrambleChars("");
        onComplete?.();
        return;
      }

      s.flick++;
      if (s.flick > flickers) {
        s.flick = 0;
        s.pos++;
      }

      setResolved(s.pos);
      setCursorChar(s.pos < currentText.length ? randomChar() : "");

      // Build scramble window (up to WINDOW_SIZE non-space chars ahead)
      let scramble = "";
      let count = 0;
      for (let i = s.pos + 1; i < currentText.length && count < WINDOW_SIZE; i++) {
        if (currentText[i] === " ") {
          scramble += " ";
        } else {
          scramble += randomChar();
          count++;
        }
      }
      setScrambleChars(scramble);

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [text, speed, flickers, onComplete]);

  // If done, just show the text
  if (resolved >= text.length) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      <span className="mx-resolved">{text.slice(0, resolved)}</span>
      <span className="mx-cursor">{cursorChar}</span>
      <span className="mx-scramble">{scrambleChars}</span>
    </span>
  );
}
