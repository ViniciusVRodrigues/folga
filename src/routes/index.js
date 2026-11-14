import * as scan from './scan.js';
import * as cleanup from './cleanup.js';

/** Para acrescentar uma área (clean...), importe o módulo e inclua na lista. */
export const registrars = [scan.register, cleanup.register];
