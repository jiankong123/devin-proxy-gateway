import { Link } from "wouter";

export function NotFoundPage() {
  return (
    <div className="rounded-lg border border-dashed border-[#1e2d3d] p-12 text-center">
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="mt-2 text-sm text-slate-400">
        That page doesn't exist.{" "}
        <Link to="/keys" className="text-blue-400 hover:underline">
          Go to Proxy Keys
        </Link>
        .
      </p>
    </div>
  );
}
