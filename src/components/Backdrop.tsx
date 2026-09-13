import React from 'react';
import ReactDOM from 'react-dom';

interface BackdropProps {
  children: React.ReactNode;
}

export function Backdrop({ children }: BackdropProps) {
  return ReactDOM.createPortal(
    <div className="backdrop">
      {children}
    </div>,
    document.body
  );
}
