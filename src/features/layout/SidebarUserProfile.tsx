import React from "react";
import { LogOut } from "lucide-react";
import type { UserProfile } from "../auth/LoginPage";

interface SidebarUserProfileProps {
  user: UserProfile;
  onLogout?: () => void;
}

export function SidebarUserProfile({ user, onLogout }: SidebarUserProfileProps) {
  return (
    <div
      style={{
        marginTop: 'auto',
        padding: '10px 12px',
        borderTop: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        background: 'var(--s1)',
        borderRadius: '10px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1.5px solid var(--line)',
              flexShrink: 0
            }}
          />
        ) : (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: user.provider === 'google' ? '#ea4335' : '#24292e',
              color: '#ffffff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0
            }}
          >
            {user.name.charAt(0)}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            style={{
              fontSize: '12.5px',
              fontWeight: 700,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {user.name}
          </span>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--dim)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {user.email}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onLogout}
        title="Cerrar Sesión"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--dim)',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '6px',
          display: 'grid',
          placeItems: 'center',
          transition: 'all 0.15s ease',
          flexShrink: 0
        }}
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}
