export function fieldClass(invalid, extra = "") {
  return ["field", invalid ? "field-invalid" : "", extra].filter(Boolean).join(" ");
}

export function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-clay-600" role="alert">
      {message}
    </p>
  );
}
