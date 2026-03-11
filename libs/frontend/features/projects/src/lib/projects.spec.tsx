import { render, screen } from '@testing-library/react';
import { FeaturesProjects } from './projects';

describe('FeaturesProjects', () => {
  it('renders empty state when no project is selected', () => {
    render(<FeaturesProjects />);

    expect(screen.getByText('未选择项目。')).toBeTruthy();
  });
});
