import React from 'react';

interface ToastProps {
  message: string;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <div className="toast">
      {message}
    </div>
  );
}
