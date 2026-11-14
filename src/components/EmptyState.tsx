import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  headingLevel?: 'h1' | 'h2';
}

export function EmptyState({ icon: Icon, title, children, actions, headingLevel = 'h2' }: Props) {
  const Heading = headingLevel;
  return (
    <div className="empty">
      <Icon className="empty-mark" size={28} strokeWidth={1.5} aria-hidden="true" />
      <Heading>{title}</Heading>
      <p>{children}</p>
      {actions && <div className="btn-row">{actions}</div>}
    </div>
  );
}
