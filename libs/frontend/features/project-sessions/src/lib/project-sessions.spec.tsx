import { render } from '@testing-library/react';

import FeaturesProjectSessions from './project-sessions';

describe('FeaturesProjectSessions', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<FeaturesProjectSessions />);
    expect(baseElement).toBeTruthy();
  });
});
