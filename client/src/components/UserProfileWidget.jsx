import { Link } from 'react-router-dom';
import { Settings2 } from 'lucide-react';

export function UserProfileWidget({ user }) {
  const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="profile-widget">
      <div className="avatar">{initials}</div>
      <div className="min-w-0">
        <p className="profile-label">User profile</p>
        <p className="profile-name truncate">{user.name}</p>
      </div>
      <Link className="icon-button ml-auto" to="/settings" aria-label="Open settings" title="Settings">
        <Settings2 size={18} />
      </Link>
    </div>
  );
}
