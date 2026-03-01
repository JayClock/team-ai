import { render } from '@testing-library/react';

import FeaturesProjects from './projects';

describe('FeaturesProjects', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<FeaturesProjects />);
    expect(baseElement).toBeTruthy();
  });
});
