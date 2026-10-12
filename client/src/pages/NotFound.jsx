import { Link } from "react-router-dom";
import { PRODUCT_SHORT_NAME } from "../lib/branding.js";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#f3ebe3_0%,_#f7f4ef_50%,_#e8eef5_100%)] text-ink-900">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16">
        <p className="font-serif text-3xl tracking-tight text-ink-900">{PRODUCT_SHORT_NAME}</p>
        <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-ink-700/75">
          That address is not part of this app. Check the link or return to the home desk.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link className="btn-primary" to="/">
            Go home
          </Link>
          <Link className="btn-ghost" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
