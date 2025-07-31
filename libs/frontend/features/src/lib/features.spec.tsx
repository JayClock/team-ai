import { render } from '@testing-library/react';

import WebFeatures from './features';

describe('WebFeatures', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<WebFeatures />);
    expect(baseElement).toBeTruthy();
  });
});
