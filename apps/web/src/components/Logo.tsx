/** Logo de Auditor Web Pyme: una lupa sobre una ventana de navegador. SVG en línea, sin estilos. */
export function Logo({ className = 'h-6 w-6' }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Logo de Auditor Web Pyme"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="22" height="18" rx="3" />
      <path d="M3 10h22" />
      <circle cx="19" cy="19" r="5" fill="white" />
      <path d="M22.5 22.5 28 28" />
    </svg>
  );
}
