import { AUDIT_RETENTION_DAYS, LEAD_RETENTION_DAYS } from '@auditor/shared';
import { LEGAL_CONTACT_EMAIL, LEGAL_OWNER } from '../../lib/legal.js';
import { LegalLayout, Section } from './LegalLayout.js';

/** Aviso de privacidad (H15). Describe lo que la app hace de verdad. */
export function PrivacyPage() {
  return (
    <LegalLayout title="Aviso de privacidad">
      <Section title="Quién es responsable">
        <p>
          El responsable de los datos es {LEGAL_OWNER}. Para cualquier consulta sobre tus datos
          escribí a {LEGAL_CONTACT_EMAIL}.
        </p>
      </Section>

      <Section title="Qué datos guardamos">
        <ul className="list-disc space-y-1 pl-6">
          <li>
            La dirección del sitio que pedís revisar y el resultado de la revisión (hallazgos y
            puntajes). No guardamos el contenido de las páginas.
          </li>
          <li>
            Tu correo, solo si lo escribís y marcás la casilla de consentimiento. Junto con el
            correo guardamos la fecha en que aceptaste y la versión del texto que aceptaste.
          </li>
          <li>
            Tu dirección IP no se guarda. Para evitar abusos calculamos una huella irreversible de
            tu conexión (con una clave secreta) y la usamos para contar cuántas revisiones pediste.
            Esa huella vive solo en la memoria del servidor y se descarta cuando vence el límite o
            cuando el servicio se reinicia.
          </li>
          <li>
            Si dejaste tu correo, el consultor puede registrar en qué estado está el contacto
            (nuevo, contactado, propuesta o cerrado) y anotar lo que hablaron. Esas notas se borran
            junto con tu correo.
          </li>
          <li>
            Si sos consultor y entrás al panel: tu correo y tu contraseña, que se guarda protegida
            (nunca en texto legible).
          </li>
        </ul>
      </Section>

      <Section title="Para qué los usamos">
        <p>
          Para armar y mostrarte el informe, para contactarte sobre el informe si dejaste tu correo
          y para evitar que la herramienta se use de forma abusiva. No los usamos para publicidad ni
          los vendemos.
        </p>
      </Section>

      <Section title="Cuánto tiempo los guardamos">
        <ul className="list-disc space-y-1 pl-6">
          <li>Los informes se borran solos a los {AUDIT_RETENTION_DAYS} días.</li>
          <li>
            Los correos se borran solos {LEAD_RETENTION_DAYS} días después de la última revisión
            asociada.
          </li>
          <li>Podés pedir que borremos antes cualquiera de tus datos.</li>
          <li>
            Esta es una demo: la base de datos se borra cada vez que el servicio se reinicia, así
            que los datos pueden durar mucho menos.
          </li>
        </ul>
      </Section>

      <Section title="Cookies">
        <p>
          La parte pública del sitio no usa cookies. El panel de consultores usa dos cookies
          técnicas, necesarias para iniciar sesión de forma segura: una para el formulario de
          ingreso (dura 10 minutos) y otra para la sesión (dura como máximo 8 horas). No usamos
          cookies de seguimiento, de publicidad ni de analítica de terceros.
        </p>
      </Section>

      <Section title="Quién más ve tus datos">
        <p>
          Nadie más, salvo quien tenga el enlace de tu informe: cualquiera con ese enlace puede
          verlo hasta que vence. El servicio está alojado en Render (Render Services, Inc.), con
          servidores en los Estados Unidos, es decir, fuera de la Argentina.
        </p>
      </Section>

      <Section title="Tus derechos">
        <p>
          Podés pedir acceso a tus datos, que los corrijamos o que los borremos, escribiendo a{' '}
          {LEGAL_CONTACT_EMAIL}. Te respondemos dentro de los plazos de la Ley 25.326 de Protección
          de los Datos Personales.
        </p>
        <p>
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los
          mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un
          interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
          N° 25.326.
        </p>
        <p>
          La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la
          Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan
          quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en
          materia de protección de datos personales.
        </p>
      </Section>
    </LegalLayout>
  );
}
