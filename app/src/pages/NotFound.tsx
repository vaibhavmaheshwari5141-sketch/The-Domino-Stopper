import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div>
      <p className="label">404</p>
      <h2 className="mt-1 text-2xl font-semibold text-navy">Page not found</h2>
      <Link to="/overview" className="focus-ring mt-2 inline-block rounded-control text-teal underline">
        Go to Overview
      </Link>
    </div>
  );
}
