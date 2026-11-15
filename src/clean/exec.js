import { execFile } from 'node:child_process';

/** execFile sem shell, com timeout e saída capturada. Rejeita com o erro (code, stdout, stderr). */
export function run(file, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      timeout: 120000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', ...opts,
    }, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = stderr; reject(err); } else resolve({ stdout, stderr });
    });
  });
}
