import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuthModule } from '../../modules/auth/auth.module';
import { CurrenciesModule } from '../../modules/currencies/currencies.module';
import { HealthModule } from '../../modules/health/health.module';
import { InvoicesModule } from '../../modules/invoices/invoices.module';
import { UsersModule } from '../../modules/users/users.module';
import { IS_PUBLIC_KEY, Public } from './public.decorator';

/** Every feature module imported by AppModule (AppModule itself is not imported: it loads the environment). */
const FEATURE_MODULES = [AuthModule, InvoicesModule, CurrenciesModule, HealthModule, UsersModule];

interface Route {
  route: string;
  isPublic: boolean;
}

/** The routes of a controller, with the same public/protected decision JwtAuthGuard makes. */
function routesOf(controller: Type): Route[] {
  const reflector = new Reflector();
  const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .map((name) => prototype[name])
    .filter((handler): handler is () => unknown => typeof handler === 'function')
    .filter((handler) => Reflect.hasMetadata(METHOD_METADATA, handler))
    .map((handler) => {
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
      const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
        handler,
        controller,
      ]);
      return {
        route: `${method} /${prefix}${path === '/' ? '' : `/${path}`}`,
        isPublic: isPublic === true,
      };
    });
}

describe('@Public()', () => {
  it('marks a route handler as public', () => {
    class TestController {
      @Public()
      open(): void {}
    }

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, TestController.prototype.open)).toBe(true);
  });

  describe('secure by default', () => {
    const routes = FEATURE_MODULES.flatMap(
      (module) =>
        (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) as Type[] | undefined) ?? [],
    ).flatMap(routesOf);

    it('finds every API route', () => {
      expect(routes.map(({ route }) => route).sort()).toEqual([
        'GET /auth/me',
        'GET /currencies',
        'GET /health',
        'GET /invoices',
        'GET /invoices/:id',
        'POST /auth/login',
        'POST /auth/logout',
        'POST /invoices',
      ]);
    });

    it('keeps every route behind authentication except login, logout and the health probe', () => {
      expect(
        routes
          .filter(({ isPublic }) => isPublic)
          .map(({ route }) => route)
          .sort(),
      ).toEqual(['GET /health', 'POST /auth/login', 'POST /auth/logout']);
    });
  });
});
