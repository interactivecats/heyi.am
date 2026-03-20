interface Props {
  current: number;
  max: number;
}

export default function CharCounter({ current, max }: Props) {
  const ratio = current / max;
  const variant =
    ratio >= 0.9
      ? "char-counter--danger"
      : ratio >= 0.7
        ? "char-counter--warning"
        : "char-counter--ok";

  return (
    <span className={`char-counter ${variant}`} aria-label={`${current} of ${max} characters`}>
      {current}/{max}
    </span>
  );
}
