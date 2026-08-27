import type { AuthenticatedUser } from '../auth/auth.types';
import { StorageProvider } from '../documents/storage.provider';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from './profile.service';

describe('ProfileService locale persistence', () => {
  const principal: AuthenticatedUser = {
    id: 'user-a',
    email: 'user@example.test',
    firstName: 'Test',
    lastName: 'User',
    organizationId: 'org-a',
    locale: 'fr',
    office: null,
    roles: [],
    permissions: [],
  };
  const user = {
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  };
  const organization = { updateMany: jest.fn() };
  const auditLog = { create: jest.fn() };
  const storage = {
    detectMimeType: jest.fn(),
    saveBuffer: jest.fn(),
    delete: jest.fn(),
  };
  const service = new ProfileService(
    { user, organization, auditLog } as unknown as PrismaService,
    storage as unknown as StorageProvider,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    user.updateMany.mockResolvedValue({ count: 1 });
    user.findFirst.mockResolvedValue({
      id: 'user-a',
      firstName: 'Test',
      lastName: 'User',
      email: 'USER@EXAMPLE.TEST',
      status: 'active',
      locale: 'en',
      office: null,
      organization: { id: 'org-a', name: 'Test Org', brandingLogo: null },
      userRoles: [],
      avatar: null,
    });
    organization.updateMany.mockResolvedValue({ count: 1 });
    auditLog.create.mockResolvedValue({});
  });

  it('updates only the authenticated tenant user and returns the persisted locale', async () => {
    await expect(service.updateLocale(principal, 'en')).resolves.toMatchObject({
      locale: 'en',
      email: 'user@example.test',
    });
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-a', organizationId: 'org-a' },
      data: { locale: 'en' },
    });
  });

  it('updates only the authenticated tenant organization and emits redacted audit data', async () => {
    await service.updateBranding(principal, '  Acme   Import  ');
    expect(organization.updateMany).toHaveBeenCalledWith({
      where: { id: 'org-a' },
      data: { name: 'Acme Import' },
    });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-a',
        newValues: { companyNameChanged: true },
      }),
    });
  });

  it('rejects a spoofed SVG logo before writing storage', async () => {
    storage.detectMimeType.mockReturnValue('application/octet-stream');
    await expect(
      service.uploadBrandingLogo(principal, {
        buffer: Buffer.from('<svg/>'),
        originalname: 'logo.png',
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BRANDING_LOGO_TYPE_INVALID' }),
    });
    expect(storage.saveBuffer).not.toHaveBeenCalled();
  });
});
