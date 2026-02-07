import { render } from '@testing-library/react';

import FeaturesProjectDiagrams from './project-diagrams';

describe('FeaturesProjectDiagrams', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<FeaturesProjectDiagrams />);
    expect(baseElement).toBeTruthy();
  });
});
