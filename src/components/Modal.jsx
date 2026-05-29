import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const Modal = React.memo(({ open, onClose, children, title }) => {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {title && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
            <button className="btn-icon" onClick={onClose} style={{ fontSize: 16, padding: 8 }} aria-label="Cerrar">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
});
Modal.displayName = 'Modal';
export default Modal;
