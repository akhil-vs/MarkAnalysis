import { Link } from "react-router-dom";

export default function Pending() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="card max-w-lg p-8 text-center">
        <h1 className="font-serif text-3xl">Awaiting approval</h1>
        <p className="mt-3 text-ink-700/70">
          Your account is with the principal. You can sign in once it is activated.
        </p>
        <Link className="btn-primary mt-6" to="/login">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
