import { Permission } from '@auto-import/contracts';
import { PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { ProfileController } from './profile.controller';

describe('ProfileController branding authorization', () => {
  it.each(['branding', 'uploadBrandingLogo', 'removeBrandingLogo'] as const)(
    'requires SETTINGS_WRITE for %s',
    (method) => {
      expect(
        Reflect.getMetadata(
          PERMISSION_KEY,
          ProfileController.prototype[method],
        ),
      ).toBe(Permission.SETTINGS_WRITE);
    },
  );

  it('allows authenticated tenant users to read the tenant-scoped logo', () => {
    expect(
      Reflect.getMetadata(
        PERMISSION_KEY,
        ProfileController.prototype.brandingLogo,
      ),
    ).toBeUndefined();
  });
});
