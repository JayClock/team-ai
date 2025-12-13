import { render } from '@testing-library/react';

import HateoasResourceReact from './resource-react';

describe('HateoasResourceReact', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<HateoasResourceReact />);
    expect(baseElement).toBeTruthy();
  });
});
