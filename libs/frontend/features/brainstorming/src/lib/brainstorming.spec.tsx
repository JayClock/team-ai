import { render } from '@testing-library/react';

import Brainstorming from './brainstorming';

describe('Brainstorming', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<Brainstorming />);
    expect(baseElement).toBeTruthy();
  });
});
