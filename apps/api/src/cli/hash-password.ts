// pnpm --filter @auditor/api user:hash
// Pide la contraseña por entrada interactiva y oculta (nunca por argumento, para que no quede
// en el historial de la terminal ni en la lista de procesos) e imprime el hash argon2id.
import { stdin, stdout, stderr, exit } from 'node:process';
import { MAX_PASSWORD_LENGTH } from '@auditor/shared';
import { hashPassword } from '../auth/passwords.js';

const MIN_LENGTH = 12;

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          stderr.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          reject(new Error('cancelado'));
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

if (!stdin.isTTY) {
  stderr.write('Ejecutalo en una terminal interactiva: la contraseña no se acepta por tubería.\n');
  exit(1);
}

try {
  const password = await readHidden('Contraseña nueva: ');
  if (password.length < MIN_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    stderr.write(
      `La contraseña tiene que tener entre ${String(MIN_LENGTH)} y ${String(MAX_PASSWORD_LENGTH)} caracteres.\n`,
    );
    exit(1);
  }
  if ((await readHidden('Repetila: ')) !== password) {
    stderr.write('Las contraseñas no coinciden.\n');
    exit(1);
  }
  stdout.write(`${await hashPassword(password)}\n`);
  stderr.write(
    'Copiá el hash en ADMIN_PASSWORD_HASH entre comillas simples (en docker-compose.yml, cada $ va como $$).\n',
  );
} catch {
  stderr.write('\nCancelado.\n');
  exit(1);
}
