import { render } from '@testing-library/react';

import FeaturesSessionEvents from './session-events';

class ResizeObserverMock {
  disconnect() {
    return undefined;
  }

  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverMock,
});

describe('FeaturesSessionEvents', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<FeaturesSessionEvents session={null} />);
    expect(baseElement).toBeTruthy();
  });
});
