import { useEffect, useId, useRef, useState } from "react";
import { generatePassword, passwordFieldActions } from "../lib/passwordField.js";

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

function OptionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection fallback.
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
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
  allowGenerate = false,
  autoFocus = false,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}) {
  const [visible, setVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState("");
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const optionsRef = useRef(null);
  const reactId = useId();
  const fieldId = id || `password-${reactId}`;
  const menuId = `${fieldId}-options`;
  const statusId = `${fieldId}-status`;
  const actions = passwordFieldActions({
    visible,
    hasValue: Boolean(String(value ?? "")),
    allowGenerate,
  });

  useEffect(() => {
    if (!menuOpen) return undefined;
    const menu = menuRef.current;
    menu?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        optionsRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(""), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  function toggleVisible() {
    setVisible((current) => !current);
    setMenuOpen(false);
  }

  async function copyPassword() {
    if (!String(value ?? "")) return;
    const ok = await copyText(String(value));
    setStatus(ok ? "Password copied" : "Could not copy password");
    setMenuOpen(false);
  }

  function generate() {
    const next = generatePassword();
    onChange(next);
    setVisible(true);
    setStatus("Password generated");
    setMenuOpen(false);
  }

  function runAction(action) {
    if (action.disabled) return;
    if (action.id === "toggle") toggleVisible();
    else if (action.id === "copy") void copyPassword();
    else if (action.id === "generate") generate();
  }

  function onMenuKeyDown(event) {
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    }
  }

  const describedBy = [ariaDescribedBy, status ? statusId : ""].filter(Boolean).join(" ") || undefined;

  return (
    <div ref={rootRef} className={menuOpen ? "relative z-20" : "relative"}>
      <input
        id={fieldId}
        name={name}
        className={[
          "field pr-[4.75rem] [&::-ms-clear]:hidden [&::-ms-reveal]:hidden",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
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
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="absolute inset-y-0 right-1 flex items-center">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-700/70 hover:bg-ink-900/5 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-500/40 disabled:opacity-40"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          disabled={disabled}
          onClick={toggleVisible}
        >
          <EyeIcon open={visible} />
        </button>
        <button
          ref={optionsRef}
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-700/70 hover:bg-ink-900/5 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-500/40 disabled:opacity-40"
          aria-label="Password options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          disabled={disabled}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <OptionsIcon />
        </button>
      </div>
      {menuOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Password options"
          className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-ink-900/10 bg-white py-1 shadow-lg"
          onKeyDown={onMenuKeyDown}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-ink-900 hover:bg-ink-900/5 disabled:cursor-not-allowed disabled:text-ink-700/40 disabled:hover:bg-transparent"
              disabled={action.disabled}
              onClick={() => runAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <p id={statusId} className="sr-only" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
