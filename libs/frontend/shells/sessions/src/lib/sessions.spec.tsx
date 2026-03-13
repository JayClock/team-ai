import ShellsSessions, {
  ShellsSessions as NamedShellsSessions,
} from './sessions';

describe('ShellsSessions', () => {
  it('exports the sessions shell component', () => {
    expect(typeof ShellsSessions).toBe('function');
    expect(NamedShellsSessions).toBe(ShellsSessions);
  });
});
