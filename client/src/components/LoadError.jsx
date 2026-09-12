export function LoadError({ message, fallback = "Could not load this page." }) {
  const text = String(message || fallback).trim() || fallback;
  return (
    <p className="text-clay-600" role="alert">
      {text}
    </p>
  );
}
