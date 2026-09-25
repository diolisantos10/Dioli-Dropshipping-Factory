import { randomUUID } from 'node:crypto';
import { authorizeCommand, CommandError, emptyStates, executeCommand, type CommandNamespace, type CommandStates } from './commands';
import { readState, writeState } from './server-state';

const MAX_ATTEMPTS = 4;
const globalForLocks = globalThis as unknown as { ddfCommandLocks?: Map<string, Promise<unknown>> };
const locks = globalForLocks.ddfCommandLocks ??= new Map();

// Commands on the same namespace are serialized inside this process, so concurrent operators do not
// race each other; the revision check in writeState still protects against other replicas.
function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  const tail = next.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return next;
}

// Loads the persisted state, applies the command on the server and writes it back with optimistic
// concurrency (revision check). A concurrent write triggers a re-read and re-validation.
export async function runServerCommand(type: string, input: Record<string, unknown>, identity: { actor: string; role: string; correlationId: string }) {
  const handler = authorizeCommand(type, input, identity.role);
  return serialized(handler.writes, async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const namespaces = [handler.writes, ...handler.reads.filter((namespace) => namespace !== handler.writes)] as CommandNamespace[];
      const rows = await Promise.all(namespaces.map((namespace) => readState(namespace)));
      const states = { ...emptyStates } as CommandStates;
      namespaces.forEach((namespace, index) => { if (rows[index]?.payload) (states as Record<string, unknown>)[namespace] = rows[index].payload; });
      const target = rows[0];
      const { namespace, payload } = executeCommand(type, states, input, { actor: identity.actor, role: identity.role, at: new Date().toISOString(), newId: randomUUID });
      const saved = await writeState(namespace, payload, target ? Number(target.revision) : null, identity.actor, identity.correlationId, { command: type });
      if (saved) return { namespace, payload: saved.payload, revision: Number(saved.revision) };
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1) + Math.random() * 50));
    }
    throw new CommandError('Os dados mudaram durante a operação. Recarregue e tente novamente.', 409);
  });
}
