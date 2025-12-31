import { render } from '@testing-library/react';

import UserConversations from './user-conversations';
import { Resource } from '@hateoas-ts/resource';
import { User } from '@shared/schema';

const mockResource = {} as Resource<User>;

describe('UserConversations', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<UserConversations resource={mockResource} />);
    expect(baseElement).toBeTruthy();
  });
});
