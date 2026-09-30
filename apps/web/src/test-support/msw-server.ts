import { setupServer } from 'msw/node';
import { handlers } from './fake-api';

export const server = setupServer(...handlers);
