import { State } from '@hateoas-ts/resource';
import { type Signal, signal } from '@preact/signals-react';
import { Project } from '@shared/schema';
import { render } from '@testing-library/react';

import ShellsProject from './project';

describe('ShellsProject', () => {
  it('should render successfully', () => {
    const state = signal(undefined) as unknown as Signal<State<Project>>;
    const { baseElement } = render(<ShellsProject state={state} />);
    expect(baseElement).toBeTruthy();
  });
});
