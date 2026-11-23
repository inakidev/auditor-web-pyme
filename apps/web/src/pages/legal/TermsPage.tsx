import { AUDIT_RETENTION_DAYS } from '@auditor/shared';
import { LEGAL_CONTACT_EMAIL, LEGAL_OWNER } from '../../lib/legal.js';
import { LegalLayout, Section } from './LegalLayout.js';

/** Términos de uso (H15). */
export function TermsPage() {
  return (
    <LegalLayout title="Términos de uso">
      <Section title="Qué hace esta herramienta">
        <p>
          Auditor Web Pyme revisa un sitio público de forma pasiva: lo mira como lo haría un
          navegador (la portada y hasta 20 enlaces internos), respeta las indicaciones del archivo
          robots.txt, hace como mucho un pedido por segundo y se identifica en cada visita. Con eso
          arma un informe de seguridad, SEO, medición y confianza.
        </p>
        <p>
          <strong>No es una prueba de intrusión.</strong> No intenta entrar al sitio, no prueba
          contraseñas, no busca archivos ocultos ni explota fallas.
        </p>
      </Section>

      <Section title="Lo que declarás al usarla">
        <p>
          Al pedir una revisión declarás que sos titular del sitio o que tenés autorización de quien
          lo es. No la uses para revisar sitios ajenos sin permiso, para saturar un sitio ni para
          esquivar los límites de uso.
        </p>
      </Section>

      <Section title="Límites de uso">
        <p>
          Para que la herramienta esté disponible para todos hay un cupo de revisiones por conexión,
          una espera mínima entre dos revisiones del mismo sitio y un tope diario que se renueva a
          la medianoche (hora de Buenos Aires).
        </p>
      </Section>

      <Section title="Sin garantías">
        <p>
          La herramienta y sus informes se ofrecen &quot;tal cual&quot;, sin garantías de ningún
          tipo. El informe es orientativo: puede tener errores u omisiones y no reemplaza una
          auditoría profesional. Las decisiones que tomes a partir de él son tu responsabilidad.
        </p>
        <p>
          Esta es una demo: puede no estar disponible, tardar hasta un minuto en arrancar y perder
          los informes cuando el servicio se reinicia. En el mejor de los casos, un informe dura{' '}
          {AUDIT_RETENTION_DAYS} días.
        </p>
      </Section>

      <Section title="Si sos titular de un sitio y no querés que lo revisemos">
        <p>
          Escribí a {LEGAL_CONTACT_EMAIL} indicando el dominio y lo excluimos de las revisiones.
        </p>
      </Section>

      <Section title="Contacto">
        <p>
          Responsable: {LEGAL_OWNER}. Consultas y reclamos: {LEGAL_CONTACT_EMAIL}. El tratamiento de
          datos se explica en el aviso de privacidad.
        </p>
      </Section>
    </LegalLayout>
  );
}
