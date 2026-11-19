import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

let sdkPromise;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => {
        if (window.google?.accounts?.id) resolve(window.google);
        else reject(new Error('No se pudo inicializar la biblioteca de Google'));
      };
      script.onerror = () => {
        script.remove();
        sdkPromise = null;
        reject(new Error('No se pudo conectar con el servicio de Google'));
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

export default function GoogleSignIn({ onCredential, disabled }) {
  const buttonRef = useRef(null);
  const callback = useRef(onCredential);
  const blocked = useRef(disabled);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'disabled' | 'error'
  const [error, setError] = useState('');
  const [gisRendered, setGisRendered] = useState(false);

  callback.current = onCredential;
  blocked.current = disabled;

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    (async () => {
      try {
        const config = await api('/auth/google/config');
        if (!active) return;

        if (!config.enabled || !config.clientId) {
          setStatus('disabled');
          return;
        }

        const google = await loadGoogle();
        if (!active) return;

        google.accounts.id.initialize({
          client_id: config.clientId,
          nonce: config.nonce,
          auto_select: false,
          ux_mode: 'popup',
          callback: async (response) => {
            if (!active || blocked.current) return;
            try {
              await callback.current(response.credential);
            } finally {
              if (active) setAttempt((a) => a + 1);
            }
          },
        });

        if (buttonRef.current) {
          buttonRef.current.replaceChildren();
          google.accounts.id.renderButton(buttonRef.current, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            text: 'continue_with',
            shape: 'rectangular',
            logo_alignment: 'center',
            width: 385,
            locale: 'es',
          });
          setGisRendered(true);
        }
        setStatus('ready');
      } catch (e) {
        if (active) {
          setError(e.message || 'No se pudo conectar con el servicio de Google');
          setStatus('error');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [attempt]);

  function handleFallbackClick() {
    if (disabled) return;
    if (status === 'disabled') {
      setError('El acceso con Google requiere configurar GOOGLE_CLIENT_ID en backend/.env');
      return;
    }
    if (status === 'ready' && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  }

  return (
    <div className="google-auth-container">
      {/* Contenedor del botón oficial rendered por Google GIS */}
      <div
        ref={buttonRef}
        className={'gis-button-target' + (status === 'ready' && gisRendered ? ' gis-visible' : ' gis-hidden')}
        inert={disabled ? '' : undefined}
        aria-busy={disabled}
      />

      {/* Botón visible de Google con icono oficial SVG cuando GIS no está renderizado directamente */}
      {(!gisRendered || status !== 'ready') && (
        <button
          type="button"
          className="btn-google-auth"
          onClick={handleFallbackClick}
          disabled={disabled || status === 'loading'}
          title="Continuar con Google"
        >
          <svg className="google-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
          </svg>
          <span>Continuar con Google</span>
        </button>
      )}

      {status === 'loading' && (
        <span className="google-status-text" role="status">Comprobando acceso con Google…</span>
      )}

      {error && (
        <div className="google-notice-box" role="alert">
          <span>{error}</span>
          {status !== 'disabled' && (
            <button type="button" className="text-button" onClick={() => setAttempt((a) => a + 1)}>
              Reintentar
            </button>
          )}
        </div>
      )}

      {/* Separador visual entre Google y el formulario tradicional */}
      <div className="auth-separator">
        <span>O continúa con tu correo</span>
      </div>
    </div>
  );
}
