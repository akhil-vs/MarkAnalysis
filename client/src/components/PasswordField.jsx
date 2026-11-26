import { useEffect, useId, useRef, useState } from "react";

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 3l18 18" strokeLinecap="round" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" strokeLinecap="round" />
        <path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c5 0 8.5 4.2 9.7 6-.5.8-1.4 2-2.7 3.2M6.1 6.1C4.4 7.4 3.3 8.9 2.3 11c1.2 1.8 4.7 6 9.7 6 1.2 0 2.3-.2 3.3-.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2.3 12C3.5 10.2 7 6 12 6s8.5 4.2 9.7 6c-1.2 1.8-4.7 6-9.7 6s-8.5-4.2-9.7-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function PasswordField({
  id,
  value,
  onChange,
  autoComplete = "current-password",
  name = "password",
  required = false,
  minLength,
  disabled = false,
  placeholder,
  className = "",
  autoFocus = false,
  revealRequest = 0,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}) {
  const [visible, setVisible] = useState(false);
  const reactId = useId();
  const fieldId = id || `password-${reactId}`;
  const seenReveal = useRef(revealRequest);

  useEffect(() => {
    if (revealRequest === seenReveal.current) return;
    seenReveal.current = revealRequest;
    setVisible(true);
  }, [revealRequest]);

  return (
    <div className="relative">
      <input
        id={fieldId}
        name={name}
        className={["field pr-10 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden", className].filter(Boolean).join(" ")}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        required={required}
        minLength={minLength}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-lg text-ink-700/70 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-500/40 disabled:opacity-40"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  );
}
