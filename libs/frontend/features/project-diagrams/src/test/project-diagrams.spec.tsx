import { render } from '@testing-library/react';

import FeaturesProjectDiagrams from '../lib/project-diagrams';

describe('FeaturesProjectDiagrams', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<FeaturesProjectDiagrams />);
    expect(baseElement).toBeTruthy();
  });
});
