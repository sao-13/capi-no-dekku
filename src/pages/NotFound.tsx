import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export function NotFound() {
  return (
    <div className="page">
      <EmptyState
        icon={Compass}
        title="There's no page at this address"
        headingLevel="h1"
        actions={
          <Link to="/" className="btn">
            Go to Today
          </Link>
        }
      >
        The link may be mistyped, or it may point to something that was deleted.
      </EmptyState>
    </div>
  );
}
