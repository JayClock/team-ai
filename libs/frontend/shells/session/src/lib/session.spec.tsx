import ShellsSession, { ShellsSession as NamedShellsSession } from './session';

describe('ShellsSession', () => {
  it('exports the session shell component', () => {
    expect(typeof ShellsSession).toBe('function');
    expect(NamedShellsSession).toBe(ShellsSession);
  });
});
