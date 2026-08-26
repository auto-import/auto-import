import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  Prisma,
  PrismaClient,
  type CallState,
  type DossierType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ALL_PERMISSIONS, DOSSIER_WORKFLOWS } from '@auto-import/contracts';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import pg from 'pg';
import {
  PRIMARY_ORG_ID,
  SECONDARY_ORG_ID,
  assertDisposableDatabase,
  at,
  readDemoSeedConfig,
  sha256,
  stableId,
} from './demo-seed-support';

dotenv.config();

const config = readDemoSeedConfig();
const pool = new pg.Pool({ connectionString: config.connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const money = (value: string | number) => new Prisma.Decimal(value);
const key = (domain: string, index: number | string) =>
  stableId(`${domain}:${index}`);

const PRIMARY_USERS = [
  ['admin', 'Amel', 'Bensalem', 'Admin', 'active'],
  ['manager', 'Nadir', 'Khelifi', 'Manager', 'active'],
  ['commercial', 'Lina', 'Mansouri', 'Commercial', 'active'],
  ['call', 'Yacine', 'Boukhelifa', 'Call Center', 'active'],
  ['finance', 'Sofia', 'Aït Ahmed', 'Finance', 'active'],
  ['logistics', 'Karim', 'Zerrouki', 'Logistics', 'active'],
  ['readonly', 'Inès', 'Meziane', 'Read-only', 'active'],
  ['inactive', 'Rania', 'Saïdi', 'Commercial', 'inactive'],
] as const;

const SECONDARY_USERS = [
  ['secondary-admin', 'Samir', 'Touati', 'Admin', 'active'],
  ['secondary-readonly', 'Nour', 'Belkacem', 'Read-only', 'active'],
] as const;

const emailFor = (slug: string) => `${slug}@demo.auto-import.invalid`;
const userId = (slug: string) => key('user', slug);
const clientId = (index: number) => key('client', index);
const prospectId = (index: number) => key('prospect', index);
const vehicleId = (index: number) => key('vehicle', index);
const dossierId = (index: number) => key('dossier', index);

async function seedFoundation(): Promise<void> {
  const passwordHash = await bcrypt.hash(config.password, 12);
  await prisma.$transaction(async (tx) => {
    const organizations = [
      {
        id: PRIMARY_ORG_ID,
        name: 'Atlas Import Démonstration',
        city: 'Alger',
        phone: '+21321010010',
        email: 'contact@atlas-import.demo.invalid',
        address: '18 rue des Jasmins, Hydra, Alger',
      },
      {
        id: SECONDARY_ORG_ID,
        name: 'Sahara Transit Démonstration',
        city: 'Oran',
        phone: '+21341020020',
        email: 'contact@sahara-transit.demo.invalid',
        address: '7 boulevard du Port, Oran',
      },
    ];
    for (const organization of organizations) {
      await tx.organization.upsert({
        where: { id: organization.id },
        update: {
          ...organization,
          type: 'headquarters',
          country: 'Algérie',
          status: 'active',
        },
        create: {
          ...organization,
          type: 'headquarters',
          country: 'Algérie',
          status: 'active',
        },
      });
      await tx.organizationSettings.upsert({
        where: { organizationId: organization.id },
        update: {
          displayName: organization.name,
          legalName: `${organization.name} SARL (fictionnelle)`,
          phone: organization.phone,
          email: organization.email,
          address: organization.address,
          locale: 'fr-DZ',
          timezone: 'Africa/Algiers',
          baseCurrency: 'DZD',
          dossierPrefix: organization.id === PRIMARY_ORG_ID ? 'DEMO' : 'ISO',
          invoicePrefix: 'FAC-DEMO',
          notificationDefaults: { inApp: true, simulatorOnly: true },
        },
        create: {
          id: key('settings', organization.id),
          organizationId: organization.id,
          displayName: organization.name,
          legalName: `${organization.name} SARL (fictionnelle)`,
          phone: organization.phone,
          email: organization.email,
          address: organization.address,
          locale: 'fr-DZ',
          timezone: 'Africa/Algiers',
          baseCurrency: 'DZD',
          dossierPrefix: organization.id === PRIMARY_ORG_ID ? 'DEMO' : 'ISO',
          invoicePrefix: 'FAC-DEMO',
          notificationDefaults: { inApp: true, simulatorOnly: true },
        },
      });
    }

    const offices = [
      [PRIMARY_ORG_ID, 'alger', 'Siège Alger', 'Alger'],
      [PRIMARY_ORG_ID, 'oran', 'Agence Oran', 'Oran'],
      [SECONDARY_ORG_ID, 'oran-iso', 'Bureau Oran', 'Oran'],
    ] as const;
    for (const [organizationId, slug, name, city] of offices) {
      await tx.office.upsert({
        where: { id: key('office', slug) },
        update: {
          organizationId,
          name,
          country: 'Algérie',
          city,
          status: 'active',
        },
        create: {
          id: key('office', slug),
          organizationId,
          name,
          country: 'Algérie',
          city,
          status: 'active',
        },
      });
    }

    const permissions = await tx.permission.findMany();
    const permissionByKey = new Map(
      permissions.map((permission) => [
        `${permission.resource}:${permission.action}`,
        permission.id,
      ]),
    );
    if (permissionByKey.size !== ALL_PERMISSIONS.length) {
      throw new Error(
        'Base seed permissions are incomplete; run the base seed first',
      );
    }
    const readOnly = ALL_PERMISSIONS.filter((permission) =>
      permission.endsWith(':read'),
    );
    const rolePermissions: Record<string, readonly string[]> = {
      Admin: ALL_PERMISSIONS,
      Manager: ALL_PERMISSIONS.filter(
        (permission) =>
          !permission.includes('manage') && permission !== 'notifications:send',
      ),
      Commercial: ALL_PERMISSIONS.filter(
        (permission) =>
          permission !== 'notifications:send' &&
          /^(prospects|clients|dossiers|vehicles|offers|tasks|notifications|crmTimeline|appointments|dashboard|documents):/.test(
            permission,
          ),
      ),
      'Call Center': ALL_PERMISSIONS.filter(
        (permission) =>
          permission !== 'notifications:send' &&
          /^(prospects|clients|callCenter|whatsapp|crmTimeline|appointments|crmKpi|tasks|notifications|dashboard):/.test(
            permission,
          ),
      ),
      Finance: ALL_PERMISSIONS.filter(
        (permission) =>
          permission !== 'notifications:send' &&
          /^(finance|invoices|paymentPlans|payments|supplierPayments|costs|exchangeRates|reports|dashboard|clients|dossiers|documents|tasks|notifications):/.test(
            permission,
          ),
      ),
      Logistics: ALL_PERMISSIONS.filter(
        (permission) =>
          permission !== 'notifications:send' &&
          /^(vehicles|warehouses|partners|offers|purchases|shipments|customs|documents|dossiers|tasks|notifications|dashboard):/.test(
            permission,
          ),
      ),
      'Read-only': readOnly,
    };

    for (const organizationId of [PRIMARY_ORG_ID, SECONDARY_ORG_ID]) {
      for (const [name, granted] of Object.entries(rolePermissions)) {
        const role = await tx.role.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: { scope: 'tenant', description: `Demo ${name}` },
          create: {
            id: key('role', `${organizationId}:${name}`),
            organizationId,
            name,
            scope: 'tenant',
            description: `Demo ${name}`,
          },
        });
        for (const permissionKey of granted) {
          const permissionId = permissionByKey.get(permissionKey);
          if (!permissionId)
            throw new Error(`Missing permission ${permissionKey}`);
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId } },
            update: {},
            create: { roleId: role.id, permissionId },
          });
        }
      }
    }

    for (const [organizationId, users, office] of [
      [PRIMARY_ORG_ID, PRIMARY_USERS, key('office', 'alger')],
      [SECONDARY_ORG_ID, SECONDARY_USERS, key('office', 'oran-iso')],
    ] as const) {
      for (const [slug, firstName, lastName, roleName, status] of users) {
        const user = await tx.user.upsert({
          where: { email: emailFor(slug) },
          update: {
            organizationId,
            officeId: office,
            firstName,
            lastName,
            passwordHash,
            status,
          },
          create: {
            id: userId(slug),
            organizationId,
            officeId: office,
            firstName,
            lastName,
            email: emailFor(slug),
            passwordHash,
            status,
          },
        });
        const role = await tx.role.findUniqueOrThrow({
          where: { organizationId_name: { organizationId, name: roleName } },
        });
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          update: {},
          create: { userId: user.id, roleId: role.id },
        });
      }
    }
  });
}

async function seedCrm(): Promise<void> {
  const statuses = [
    'new',
    'contacted',
    'interested',
    'qualified',
    'offerSent',
    'negotiating',
    'won',
    'lost',
    'converted',
  ];
  const qualifications = ['HOT', 'WARM', 'COLD'] as const;
  const leadCount = config.scale === 'medium' ? 45 : 27;
  const firstNames = [
    'Amina',
    'Walid',
    'Kenza',
    'Mehdi',
    'Lamia',
    'Riad',
    'Yasmine',
    'Anis',
    'Nesrine',
  ];
  const wilayas = [
    'Alger',
    'Oran',
    'Sétif',
    'Tlemcen',
    'Béjaïa',
    'Constantine',
  ];
  const sources = [
    'site_web',
    'salon_auto',
    'recommandation',
    'whatsapp',
    'appel_entrant',
  ];
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < leadCount; index += 1) {
      const id = prospectId(index);
      const status = statuses[index % statuses.length];
      const createdAt = at(config.anchor, -90 + index * 2);
      await tx.prospect.upsert({
        where: { id },
        update: {
          organizationId: PRIMARY_ORG_ID,
          status,
          qualification: qualifications[index % 3],
          assignedTo: userId(index % 2 === 0 ? 'commercial' : 'call'),
          nextActionAt:
            index === 0
              ? at(config.anchor, -2)
              : at(config.anchor, 2 + (index % 10)),
        },
        create: {
          id,
          organizationId: PRIMARY_ORG_ID,
          firstName: firstNames[index % firstNames.length],
          lastName: `Prospect Démo ${String(index + 1).padStart(2, '0')}`,
          phone: `+21355${String(1000000 + index).slice(-7)}`,
          email: `prospect-${index + 1}@example.demo.invalid`,
          wilaya: wilayas[index % wilayas.length],
          source: sources[index % sources.length],
          status,
          qualification: qualifications[index % 3],
          assignedTo: userId(index % 2 === 0 ? 'commercial' : 'call'),
          notes:
            index === 2
              ? 'يفضّل التواصل مساءً — données fictives'
              : 'Scénario de démonstration',
          lastInteractionAt: at(config.anchor, -index % 14),
          nextActionAt:
            index === 0
              ? at(config.anchor, -2)
              : at(config.anchor, 2 + (index % 10)),
          convertedAt: status === 'converted' ? at(config.anchor, -3) : null,
          createdAt,
        },
      });
      await tx.contactPoint.upsert({
        where: { id: key('contact-point', index) },
        update: {},
        create: {
          id: key('contact-point', index),
          organizationId: PRIMARY_ORG_ID,
          kind: 'PHONE',
          displayValue: `055 ${String(1000000 + index).slice(-7)}`,
          normalizedValue: `+21355${String(1000000 + index).slice(-7)}`,
          whatsappEnabled: index % 2 === 0,
          prospectId: id,
          preferred: true,
          verified: index % 4 !== 0,
          createdAt,
        },
      });
      await tx.prospectStatusHistory.upsert({
        where: { id: key('prospect-history', index) },
        update: {},
        create: {
          id: key('prospect-history', index),
          organizationId: PRIMARY_ORG_ID,
          prospectId: id,
          changedBy: userId('commercial'),
          fromStatus: null,
          toStatus: status,
          reason: 'Scénario déterministe de démonstration',
          occurredAt: createdAt,
        },
      });
      await tx.prospectActivity.upsert({
        where: { id: key('prospect-activity', index) },
        update: {},
        create: {
          id: key('prospect-activity', index),
          prospectId: id,
          userId: userId('commercial'),
          type: index % 2 ? 'call' : 'note',
          title:
            index % 2 ? 'Appel de qualification' : 'Besoin véhicule précisé',
          description: 'Échange fictif, sans donnée personnelle réelle.',
          activityDate: at(createdAt, 1),
          createdAt: at(createdAt, 1),
        },
      });
    }

    for (let index = 0; index < 18; index += 1) {
      const convertedIndex = index < 3 ? 8 + index * 9 : null;
      await tx.client.upsert({
        where: { id: clientId(index) },
        update: {
          organizationId: PRIMARY_ORG_ID,
          assignedTo: userId('commercial'),
        },
        create: {
          id: clientId(index),
          organizationId: PRIMARY_ORG_ID,
          prospectId:
            convertedIndex === null ? null : prospectId(convertedIndex),
          firstName: firstNames[(index + 2) % firstNames.length],
          lastName: `Client Démo ${String(index + 1).padStart(2, '0')}`,
          phone: `+21366${String(2000000 + index).slice(-7)}`,
          email: `client-${index + 1}@example.demo.invalid`,
          nationality: 'Algérienne',
          address: `${10 + index} rue des Oliviers, ${wilayas[index % wilayas.length]}`,
          status: index === 17 ? 'inactive' : 'active',
          assignedTo: userId('commercial'),
          lastInteractionAt: at(config.anchor, -(index % 10)),
          nextActionAt: at(config.anchor, 1 + (index % 12)),
          createdAt: at(config.anchor, -75 + index * 3),
        },
      });
      await tx.crmNote.upsert({
        where: { id: key('crm-note', index) },
        update: {},
        create: {
          id: key('crm-note', index),
          organizationId: PRIMARY_ORG_ID,
          clientId: clientId(index),
          authorId: userId('commercial'),
          content:
            index === 1
              ? 'Client préfère un véhicule bleu. مرحباً'
              : 'Suivi commercial de démonstration.',
          occurredAt: at(config.anchor, -12 + index),
          createdAt: at(config.anchor, -12 + index),
        },
      });
    }

    const voiceChannelId = key('channel', 'voice-primary');
    const whatsappChannelId = key('channel', 'whatsapp-primary');
    for (const channel of [
      {
        id: voiceChannelId,
        channel: 'VOICE' as const,
        number: '+21321010101',
        name: 'Ligne commerciale démo',
      },
      {
        id: whatsappChannelId,
        channel: 'WHATSAPP' as const,
        number: '+21321010102',
        name: 'WhatsApp commercial démo',
      },
    ]) {
      await tx.companyChannel.upsert({
        where: { id: channel.id },
        update: {
          active: true,
          routingConfig: { simulated: true, externalCallsDisabled: true },
        },
        create: {
          id: channel.id,
          organizationId: PRIMARY_ORG_ID,
          channel: channel.channel,
          displayName: channel.name,
          normalizedNumber: channel.number,
          providerKey: 'demo-simulator',
          queueName: 'commercial-demo',
          routingConfig: { simulated: true, externalCallsDisabled: true },
        },
      });
    }
    for (const slug of ['call', 'commercial']) {
      await tx.agentPresence.upsert({
        where: { userId: userId(slug) },
        update: {
          status: slug === 'call' ? 'AVAILABLE' : 'AWAY',
          source: 'MANUAL',
          lastHeartbeatAt: config.anchor,
        },
        create: {
          id: key('presence', slug),
          organizationId: PRIMARY_ORG_ID,
          userId: userId(slug),
          status: slug === 'call' ? 'AVAILABLE' : 'AWAY',
          source: 'MANUAL',
          lastHeartbeatAt: config.anchor,
        },
      });
    }
    const callStates = [
      'QUEUED',
      'ANSWERED',
      'FORWARDED',
      'COMPLETED',
      'MISSED',
      'FAILED',
    ] as const;
    for (let index = 0; index < 18; index += 1) {
      const state = callStates[index % callStates.length];
      const receivedAt = at(config.anchor, -14 + index, -2);
      const callId = key('call', index);
      const answered = ['ANSWERED', 'FORWARDED', 'COMPLETED'].includes(state);
      await tx.callSession.upsert({
        where: { id: callId },
        update: { state },
        create: {
          id: callId,
          organizationId: PRIMARY_ORG_ID,
          channelId: voiceChannelId,
          providerKey: 'demo-simulator',
          providerCallId: `demo-call-${String(index + 1).padStart(3, '0')}`,
          direction: index % 3 === 0 ? 'OUTBOUND' : 'INBOUND',
          companyNumber: '+21321010101',
          externalNumber:
            index % 5 === 0
              ? `+213770${String(3000 + index)}`
              : `+21355${String(1000000 + index).slice(-7)}`,
          prospectId: index < 12 ? prospectId(index) : null,
          clientId: index >= 12 ? clientId(index - 12) : null,
          dispatcherId: userId('manager'),
          handlingEmployeeId: state === 'QUEUED' ? null : userId('call'),
          state,
          receivedAt,
          queuedAt: at(receivedAt, 0, 0.01),
          answeredAt: answered ? at(receivedAt, 0, 0.02) : null,
          completedAt: ['COMPLETED', 'MISSED', 'FAILED'].includes(state)
            ? at(receivedAt, 0, 0.08)
            : null,
          durationSeconds: answered ? 180 + index * 11 : 0,
          waitingSeconds: 8 + index,
          outcome:
            state === 'COMPLETED'
              ? 'qualification_effectuée'
              : state.toLowerCase(),
          nextAction: index === 4 ? 'Rappeler le prospect' : null,
          nextActionAt: index === 4 ? at(config.anchor, -1) : null,
          missedReason: state === 'MISSED' ? 'agent_indisponible' : null,
          failureReason: state === 'FAILED' ? 'simulation_réseau' : null,
          createdAt: receivedAt,
        },
      });
      const eventStates: CallState[] = answered
        ? ['RINGING', 'QUEUED', 'ANSWERED', state]
        : ['RINGING', state];
      for (
        let eventIndex = 0;
        eventIndex < eventStates.length;
        eventIndex += 1
      ) {
        await tx.callEvent.upsert({
          where: { id: key('call-event', `${index}:${eventIndex}`) },
          update: {},
          create: {
            id: key('call-event', `${index}:${eventIndex}`),
            callSessionId: callId,
            providerEventId: `demo-call-${index}-event-${eventIndex}`,
            state: eventStates[eventIndex],
            actorUserId: eventIndex > 0 ? userId('call') : null,
            metadata: { simulator: true },
            occurredAt: new Date(receivedAt.getTime() + eventIndex * 30_000),
            createdAt: new Date(receivedAt.getTime() + eventIndex * 30_000),
          },
        });
      }
    }
    for (let index = 0; index < 8; index += 1) {
      const conversationId = key('conversation', index);
      await tx.whatsappConversation.upsert({
        where: { id: conversationId },
        update: { assignedTo: userId('call') },
        create: {
          id: conversationId,
          organizationId: PRIMARY_ORG_ID,
          channelId: whatsappChannelId,
          providerKey: 'demo-simulator',
          providerConversationId: `demo-wa-${index}`,
          externalNumber: `+21366${String(4000000 + index).slice(-7)}`,
          prospectId: prospectId(index),
          assignedTo: userId('call'),
          lastMessageAt: at(config.anchor, -index),
          createdAt: at(config.anchor, -index - 2),
        },
      });
      const messageStatuses = [
        'RECEIVED',
        'SENT',
        'DELIVERED',
        'READ',
      ] as const;
      for (let messageIndex = 0; messageIndex < 4; messageIndex += 1) {
        const occurredAt = at(config.anchor, -index, -3 + messageIndex);
        await tx.whatsappMessage.upsert({
          where: { id: key('message', `${index}:${messageIndex}`) },
          update: { status: messageStatuses[messageIndex] },
          create: {
            id: key('message', `${index}:${messageIndex}`),
            organizationId: PRIMARY_ORG_ID,
            conversationId,
            providerKey: 'demo-simulator',
            providerMessageId: `demo-wa-${index}-${messageIndex}`,
            direction: messageIndex % 2 === 0 ? 'INBOUND' : 'OUTBOUND',
            contentType: 'TEXT',
            text:
              messageIndex % 2 === 0
                ? 'Bonjour, je souhaite connaître le délai.'
                : 'Bonjour, nous revenons vers vous avec une estimation.',
            status: messageStatuses[messageIndex],
            occurredAt,
            sentAt: messageIndex > 0 ? occurredAt : null,
            receivedAt: messageIndex === 0 ? occurredAt : null,
            deliveredAt: messageIndex > 1 ? occurredAt : null,
            readAt: messageIndex === 3 ? occurredAt : null,
            createdAt: occurredAt,
          },
        });
      }
    }
    for (let index = 0; index < 8; index += 1) {
      const start =
        index === 0 ? at(config.anchor, -1) : at(config.anchor, index + 1);
      await tx.appointment.upsert({
        where: { id: key('appointment', index) },
        update: {
          scheduledStart: start,
          scheduledEnd: new Date(start.getTime() + 3_600_000),
        },
        create: {
          id: key('appointment', index),
          organizationId: PRIMARY_ORG_ID,
          assignedTo: userId('commercial'),
          prospectId: index < 4 ? prospectId(index) : null,
          clientId: index >= 4 ? clientId(index - 4) : null,
          title:
            index === 0
              ? 'Relance en retard'
              : `Rendez-vous commercial ${index + 1}`,
          scheduledStart: start,
          scheduledEnd: new Date(start.getTime() + 3_600_000),
          status: index === 0 ? 'NO_SHOW' : 'SCHEDULED',
          notes: 'Rendez-vous fictif',
          createdAt: at(config.anchor, -10),
        },
      });
    }
  });
}

async function seedCommerceAndDossiers(): Promise<void> {
  const warehouseIds = [key('warehouse', 'alger'), key('warehouse', 'oran')];
  const locationIds = [
    key('location', 'alger-a'),
    key('location', 'alger-b'),
    key('location', 'oran-a'),
    key('location', 'oran-customs'),
  ];
  const partnerSpecs = [
    [
      'guangzhou',
      'Guangzhou Horizon Motors',
      'supplier',
      'Guangzhou',
      'Li Wei',
      'active',
    ],
    [
      'shanghai',
      'Shanghai Nouvelle Route',
      'supplier',
      'Shanghai',
      'Chen Yu',
      'active',
    ],
    [
      'shenzhen',
      'Shenzhen E-Mobility Export',
      'supplier',
      'Shenzhen',
      'Zhang Min',
      'active',
    ],
    [
      'ningbo',
      'Ningbo Auto Source',
      'supplier',
      'Ningbo',
      'Wang Lei',
      'archived',
    ],
    [
      'carrier',
      'Sino-Méditerranée Shipping',
      'carrier',
      'Qingdao',
      'Liu Fang',
      'active',
    ],
    [
      'broker',
      'Maghreb Douane Conseil',
      'customsBroker',
      'Alger',
      'Sonia Rahal',
      'active',
    ],
  ] as const;
  await prisma.$transaction(async (tx) => {
    for (const [
      slug,
      name,
      type,
      city,
      contactPerson,
      status,
    ] of partnerSpecs) {
      await tx.partner.upsert({
        where: { id: key('partner', slug) },
        update: { name, type, city, contactPerson, status },
        create: {
          id: key('partner', slug),
          organizationId: PRIMARY_ORG_ID,
          name,
          type,
          country: type === 'customsBroker' ? 'Algérie' : 'Chine',
          city,
          contactPerson,
          phone: type === 'customsBroker' ? '+21321030303' : '+8613800000000',
          email: `${slug}@partners.demo.invalid`,
          address: `${city}, adresse commerciale fictive`,
          paymentTerms: '30 % commande, 70 % avant embarquement',
          deliveryTerms: 'FOB / CIF selon dossier',
          specialties:
            type === 'supplier' ? ['véhicules neufs', 'export'] : [type],
          notes: 'Partenaire entièrement fictif pour démonstration.',
          status,
          createdAt: at(config.anchor, -180),
        },
      });
    }
    for (const [index, warehouse] of [
      { name: 'Parc véhicules Alger', city: 'Alger', type: 'vehicle_yard' },
      { name: 'Zone logistique Oran', city: 'Oran', type: 'port_buffer' },
    ].entries()) {
      await tx.warehouse.upsert({
        where: { id: warehouseIds[index] },
        update: { ...warehouse, status: 'active' },
        create: {
          id: warehouseIds[index],
          organizationId: PRIMARY_ORG_ID,
          ...warehouse,
          country: 'Algérie',
          address: `${index + 4} zone industrielle, ${warehouse.city}`,
          status: 'active',
          createdAt: at(config.anchor, -150),
        },
      });
    }
    const locations = [
      [locationIds[0], warehouseIds[0], 'A-01', 'Disponible'],
      [locationIds[1], warehouseIds[0], 'B-02', 'Réservé'],
      [locationIds[2], warehouseIds[1], 'P-01', 'Arrivage'],
      [locationIds[3], warehouseIds[1], 'D-01', 'Zone douane'],
    ] as const;
    for (const [id, warehouseId, code, name] of locations) {
      await tx.warehouseLocation.upsert({
        where: { id },
        update: { warehouseId, code, name, status: 'active' },
        create: { id, warehouseId, code, name, status: 'active' },
      });
    }

    const brands = ['BYD', 'Geely', 'Chery', 'MG', 'GAC', 'Dongfeng'];
    const models = ['Song Plus', 'Coolray', 'Tiggo 7', 'ZS', 'GS3', 'Aeolus'];
    const vehicleStatuses = [
      'available',
      'reserved',
      'sold',
      'inTransit',
      'inCustoms',
      'delivered',
    ];
    for (let index = 0; index < 22; index += 1) {
      const status = vehicleStatuses[index % vehicleStatuses.length];
      const currentLocationId =
        status === 'inTransit' ? null : locationIds[index % locationIds.length];
      await tx.vehicle.upsert({
        where: { id: vehicleId(index) },
        update: { status, currentLocationId },
        create: {
          id: vehicleId(index),
          organizationId: PRIMARY_ORG_ID,
          vin: `LDMO26${String(index + 1).padStart(11, '0')}`,
          brand: brands[index % brands.length],
          model: models[index % models.length],
          year: 2024 + (index % 3),
          mileage: index % 4 === 0 ? 4200 + index * 50 : 20 + index,
          condition: index % 4 === 0 ? 'used' : 'new',
          purchasePrice: money(13_000 + index * 350),
          sellingPrice: money(2_800_000 + index * 75_000),
          currency: index % 2 === 0 ? 'USD' : 'DZD',
          status,
          acquisitionType: index % 3 === 0 ? 'clientRequest' : 'stock',
          supplierId: key('partner', partnerSpecs[index % 4][0]),
          currentLocationId,
          acquiredAt: at(config.anchor, -120 + index * 3),
          createdAt: at(config.anchor, -125 + index * 3),
        },
      });
      await tx.vehicleSpec.upsert({
        where: { vehicleId: vehicleId(index) },
        update: { color: ['Blanc nacré', 'Bleu', 'Gris', 'Noir'][index % 4] },
        create: {
          id: key('vehicle-spec', index),
          vehicleId: vehicleId(index),
          engine: index % 2 ? '1.5 T' : 'Électrique 150 kW',
          fuelType: index % 2 ? 'essence' : 'électrique',
          transmission: 'automatique',
          color: ['Blanc nacré', 'Bleu', 'Gris', 'Noir'][index % 4],
          seats: 5,
          doors: 5,
          power: index % 2 ? '177 ch' : '204 ch',
          description: 'Configuration fictive conforme au scénario démo.',
        },
      });
      await tx.stockMovement.upsert({
        where: { id: key('stock-movement', index) },
        update: { toLocationId: currentLocationId },
        create: {
          id: key('stock-movement', index),
          organizationId: PRIMARY_ORG_ID,
          vehicleId: vehicleId(index),
          fromLocationId: null,
          toLocationId: currentLocationId,
          performedBy: userId('logistics'),
          type: currentLocationId ? 'entry' : 'dispatch',
          reason: 'Mouvement initial de démonstration',
          occurredAt: at(config.anchor, -30 + index),
          createdAt: at(config.anchor, -30 + index),
        },
      });
    }

    for (let index = 0; index < 14; index += 1) {
      const availableQuantity = 2 + (index % 4);
      const reservedQuantity =
        index % 4 === 0 ? 0 : index % 4 === 1 ? 1 : availableQuantity;
      const status =
        index % 7 === 5
          ? 'expired'
          : reservedQuantity === 0
            ? 'available'
            : reservedQuantity < availableQuantity
              ? 'reserved'
              : index % 7 === 6
                ? 'sold'
                : 'reserved';
      await tx.chinaOffer.upsert({
        where: { id: key('offer', index) },
        update: { availableQuantity, reservedQuantity, status },
        create: {
          id: key('offer', index),
          organizationId: PRIMARY_ORG_ID,
          supplierId: key('partner', partnerSpecs[index % 4][0]),
          reference: `OFF-DEMO-${String(index + 1).padStart(3, '0')}`,
          brand: brands[index % brands.length],
          model: models[index % models.length],
          version: index % 2 ? 'Luxury' : 'Comfort',
          year: 2025 + (index % 2),
          condition: 'new',
          mileage: 15 + index,
          specification: {
            transmission: 'automatique',
            color: ['blanc', 'gris', 'bleu'][index % 3],
            origin: 'CN',
          },
          purchasePrice: money(12_500 + index * 400),
          cifPrice: money(16_000 + index * 450),
          ddpPrice: money(19_500 + index * 500),
          currency: ['USD', 'CNY', 'EUR'][index % 3],
          validFrom: at(config.anchor, -30),
          validUntil:
            status === 'expired'
              ? at(config.anchor, -1)
              : at(config.anchor, 30 + index),
          availableQuantity,
          reservedQuantity,
          estimatedDelayDays: 45 + index,
          status,
          notes: 'Offre commerciale fictive.',
          archivedAt: status === 'sold' ? at(config.anchor, -2) : null,
          createdAt: at(config.anchor, -35 + index),
        },
      });
    }

    for (let index = 0; index < 8; index += 1) {
      await tx.vehicleRequest.upsert({
        where: { id: key('vehicle-request', index) },
        update: {
          status: ['open', 'sourcing', 'candidateSelected', 'purchased'][
            index % 4
          ],
        },
        create: {
          id: key('vehicle-request', index),
          organizationId: PRIMARY_ORG_ID,
          prospectId: index < 3 ? prospectId(index) : null,
          clientId: index >= 3 ? clientId(index) : null,
          assignedTo: userId('commercial'),
          brand: brands[index % brands.length],
          model: models[index % models.length],
          minYear: 2024,
          maxYear: 2026,
          budgetMin: money(2_500_000),
          budgetMax: money(4_800_000),
          currency: 'DZD',
          preferredColor: ['blanc', 'gris', 'bleu'][index % 3],
          requirements: 'Boîte automatique, caméra de recul',
          status: ['open', 'sourcing', 'candidateSelected', 'purchased'][
            index % 4
          ],
          createdAt: at(config.anchor, -40 + index),
        },
      });
      for (let candidateIndex = 0; candidateIndex < 2; candidateIndex += 1) {
        const status =
          candidateIndex === 0
            ? index % 3 === 0
              ? 'validated'
              : 'proposed'
            : 'rejected';
        await tx.vehicleCandidate.upsert({
          where: { id: key('candidate', `${index}:${candidateIndex}`) },
          update: { status },
          create: {
            id: key('candidate', `${index}:${candidateIndex}`),
            vehicleRequestId: key('vehicle-request', index),
            vehicleId: vehicleId((index * 2 + candidateIndex) % 22),
            proposedPrice: money(2_900_000 + index * 80_000),
            currency: 'DZD',
            status,
            notes:
              status === 'rejected'
                ? 'Budget dépassé'
                : 'Correspond aux critères',
            presentedAt: at(config.anchor, -25 + index),
            validatedAt:
              status === 'validated' ? at(config.anchor, -20 + index) : null,
          },
        });
      }
    }

    const targets: Array<{ type: DossierType; status: string }> = [];
    const targetIndexes = [0, 1, 3, 4, -2, -1];
    for (const type of [
      'VEHICLE_SALE_CIF',
      'VEHICLE_SALE_DDP',
      'SHIPPING_ONLY',
    ] as const) {
      const workflow = DOSSIER_WORKFLOWS[type];
      for (const targetIndex of targetIndexes) {
        targets.push({
          type,
          status:
            targetIndex === -1
              ? 'cancelled'
              : workflow[
                  targetIndex === -2 ? workflow.length - 2 : targetIndex
                ],
        });
      }
    }
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const order = key('order', index);
      const total = 3_000_000 + index * 100_000;
      await tx.order.upsert({
        where: { id: order },
        update: {
          status: target.status === 'cancelled' ? 'cancelled' : 'confirmed',
          total: money(total),
          subtotal: money(total),
        },
        create: {
          id: order,
          organizationId: PRIMARY_ORG_ID,
          orderNumber: `CMD-DEMO-${String(index + 1).padStart(3, '0')}`,
          clientId: clientId(index),
          createdBy: userId('commercial'),
          status: target.status === 'cancelled' ? 'cancelled' : 'confirmed',
          subtotal: money(total),
          discount: money(0),
          total: money(total),
          currency: 'DZD',
          orderDate: at(config.anchor, -70 + index * 3),
          confirmedAt:
            target.status === 'cancelled'
              ? null
              : at(config.anchor, -69 + index * 3),
          createdAt: at(config.anchor, -70 + index * 3),
        },
      });
      await tx.orderItem.upsert({
        where: { id: key('order-item', index) },
        update: { total: money(total), unitPrice: money(total) },
        create: {
          id: key('order-item', index),
          orderId: order,
          vehicleId: vehicleId(index),
          unitPrice: money(total),
          discount: money(0),
          total: money(total),
          createdAt: at(config.anchor, -70 + index * 3),
        },
      });
      await tx.orderStatusHistory.upsert({
        where: { id: key('order-history', index) },
        update: {},
        create: {
          id: key('order-history', index),
          orderId: order,
          changedBy: userId('commercial'),
          fromStatus: 'draft',
          toStatus: target.status === 'cancelled' ? 'cancelled' : 'confirmed',
          comment: 'Historique démo',
          createdAt: at(config.anchor, -69 + index * 3),
        },
      });
      await tx.dossier.upsert({
        where: { id: dossierId(index) },
        update: { status: target.status, type: target.type },
        create: {
          id: dossierId(index),
          organizationId: PRIMARY_ORG_ID,
          reference: `DEMO-${target.type === 'VEHICLE_SALE_CIF' ? 'CIF' : target.type === 'VEHICLE_SALE_DDP' ? 'DDP' : 'SHP'}-${String((index % 6) + 1).padStart(3, '0')}`,
          type: target.type,
          clientId: clientId(index),
          orderId: order,
          status: target.status,
          salesUserId: userId('commercial'),
          opsUserId: userId('logistics'),
          openedAt: at(config.anchor, -68 + index * 3),
          closedAt: ['closed', 'serviceCompleted', 'cancelled'].includes(
            target.status,
          )
            ? at(config.anchor, -1)
            : null,
          createdAt: at(config.anchor, -68 + index * 3),
        },
      });
      await tx.dossierVehicle.upsert({
        where: {
          dossierId_vehicleId: {
            dossierId: dossierId(index),
            vehicleId: vehicleId(index),
          },
        },
        update: {},
        create: {
          id: key('dossier-vehicle', index),
          dossierId: dossierId(index),
          vehicleId: vehicleId(index),
          assignedAt: at(config.anchor, -67 + index * 3),
        },
      });
      const workflow = DOSSIER_WORKFLOWS[target.type];
      const targetPosition = workflow.findIndex(
        (status) => status === target.status,
      );
      const statuses =
        target.status === 'cancelled'
          ? [workflow[0], 'cancelled']
          : workflow.slice(0, targetPosition + 1);
      for (
        let historyIndex = 0;
        historyIndex < statuses.length;
        historyIndex += 1
      ) {
        await tx.dossierStatusHistory.upsert({
          where: { id: key('dossier-history', `${index}:${historyIndex}`) },
          update: {},
          create: {
            id: key('dossier-history', `${index}:${historyIndex}`),
            dossierId: dossierId(index),
            fromStatus: historyIndex === 0 ? null : statuses[historyIndex - 1],
            toStatus: statuses[historyIndex],
            changedBy:
              historyIndex % 2 ? userId('logistics') : userId('commercial'),
            comment:
              historyIndex === statuses.length - 1
                ? `Scénario ${target.status}`
                : 'Progression historique démo',
            createdAt: at(config.anchor, -65 + index * 3 + historyIndex),
          },
        });
      }
      await tx.reservation.upsert({
        where: { id: key('reservation', index) },
        update: {
          status: target.status === 'cancelled' ? 'released' : 'consumed',
        },
        create: {
          id: key('reservation', index),
          organizationId: PRIMARY_ORG_ID,
          vehicleId: vehicleId(index),
          orderId: order,
          reservedBy: userId('commercial'),
          status: target.status === 'cancelled' ? 'released' : 'consumed',
          reservedAt: at(config.anchor, -67 + index * 3),
          expiresAt: at(config.anchor, 14),
          releasedAt:
            target.status === 'cancelled' ? at(config.anchor, -2) : null,
          releaseReason:
            target.status === 'cancelled'
              ? 'Dossier annulé — ressources libérées'
              : null,
        },
      });
      if (index < 12) {
        await tx.offerReservation.upsert({
          where: { id: key('offer-reservation', index) },
          update: {
            status: target.status === 'cancelled' ? 'released' : 'consumed',
          },
          create: {
            id: key('offer-reservation', index),
            organizationId: PRIMARY_ORG_ID,
            offerId: key('offer', index % 14),
            clientId: clientId(index),
            dossierId: dossierId(index),
            quantity: 1,
            status: target.status === 'cancelled' ? 'released' : 'consumed',
            expiresAt: at(config.anchor, 14),
            releasedAt:
              target.status === 'cancelled' ? at(config.anchor, -2) : null,
            releaseReason:
              target.status === 'cancelled' ? 'Dossier annulé' : null,
            createdBy: userId('commercial'),
            createdAt: at(config.anchor, -67 + index * 3),
          },
        });
      }
      if (target.status !== 'cancelled' && index % 6 >= 3 && index < 12) {
        await tx.purchase.upsert({
          where: { id: key('purchase', index) },
          update: { status: 'confirmed' },
          create: {
            id: key('purchase', index),
            organizationId: PRIMARY_ORG_ID,
            purchaseNumber: `ACH-DEMO-${String(index + 1).padStart(3, '0')}`,
            supplierId: key('partner', partnerSpecs[index % 4][0]),
            vehicleId: vehicleId(index),
            purchasePrice: money(14_000 + index * 300),
            currency: 'USD',
            status: 'confirmed',
            purchaseDate: at(config.anchor, -35 + index),
            dossierId: dossierId(index),
            orderId: order,
            confirmedBy: userId('manager'),
            supplierSnapshot: {
              name: partnerSpecs[index % 4][1],
              country: 'Chine',
            },
            vehicleSnapshot: {
              vin: `LDMO26${String(index + 1).padStart(11, '0')}`,
              demo: true,
            },
            offerReservationId: key('offer-reservation', index),
            createdAt: at(config.anchor, -36 + index),
          },
        });
      }
      await tx.dossierNote.upsert({
        where: { id: key('dossier-note', index) },
        update: {},
        create: {
          id: key('dossier-note', index),
          organizationId: PRIMARY_ORG_ID,
          dossierId: dossierId(index),
          authorId: userId('manager'),
          content:
            index % 6 === 1
              ? 'SCENARIO_BLOCKED: contrat requis avant progression.'
              : index % 6 === 3
                ? 'SCENARIO_READY: acompte et preuves disponibles.'
                : 'Scénario opérationnel de démonstration.',
          createdAt: at(config.anchor, -3),
        },
      });
    }
  });
}

async function seedFinanceLogistics(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const currencies = ['DZD', 'USD', 'CNY', 'EUR'];
    const rates: Record<string, Prisma.Decimal> = {
      DZD: money(1),
      USD: money('132.50000000'),
      CNY: money('18.25000000'),
      EUR: money('146.75000000'),
    };
    for (let month = 0; month < 12; month += 1) {
      for (const currency of currencies.slice(1)) {
        const rate = rates[currency].plus(month).toDecimalPlaces(8);
        await tx.exchangeRate.upsert({
          where: { id: key('exchange-rate', `${currency}:${month}`) },
          update: { rate, effectiveAt: at(config.anchor, -month * 30) },
          create: {
            id: key('exchange-rate', `${currency}:${month}`),
            organizationId: PRIMARY_ORG_ID,
            baseCurrency: currency,
            quoteCurrency: 'DZD',
            rate,
            effectiveAt: at(config.anchor, -month * 30),
            source: 'DEMO_HISTORICAL_FIXED',
            notes: 'Taux fictif pour démonstration uniquement',
            createdById: userId('finance'),
            createdAt: at(config.anchor, -month * 30),
          },
        });
      }
    }

    const invoiceStatuses = [
      'DRAFT',
      'ISSUED',
      'PARTIALLY_PAID',
      'PAID',
      'OVERDUE',
      'VOIDED',
    ];
    for (let index = 0; index < 18; index += 1) {
      const currency = currencies[index % currencies.length];
      const total = new Prisma.Decimal(
        currency === 'DZD' ? 3_000_000 + index * 100_000 : 18_000 + index * 750,
      );
      const invoiceStatus = invoiceStatuses[index % invoiceStatuses.length];
      const planStrategy = index % 3 === 0 ? 'FULL_UPFRONT' : 'THIRTY_SEVENTY';
      const firstAmount =
        planStrategy === 'FULL_UPFRONT'
          ? total
          : total.mul(30).div(100).toDecimalPlaces(2);
      const secondAmount = total.minus(firstAmount);
      let paidAmount = money(0);
      if (invoiceStatus === 'PARTIALLY_PAID') paidAmount = firstAmount;
      if (invoiceStatus === 'PAID') paidAmount = total;
      const invoice = await tx.invoice.upsert({
        where: { id: key('invoice', index) },
        update: { status: invoiceStatus, total, paidAmount, currency },
        create: {
          id: key('invoice', index),
          organizationId: PRIMARY_ORG_ID,
          invoiceNumber: `FAC-DEMO-${String(index + 1).padStart(3, '0')}`,
          orderId: key('order', index),
          dossierId: dossierId(index),
          clientId: clientId(index),
          status: invoiceStatus,
          subtotal: total,
          tax: money(0),
          discount: money(0),
          total,
          paidAmount,
          currency,
          issueDate:
            invoiceStatus === 'DRAFT'
              ? null
              : at(config.anchor, -330 + index * 18),
          dueDate:
            invoiceStatus === 'OVERDUE'
              ? at(config.anchor, -10)
              : at(config.anchor, 20 + index),
          voidedAt: invoiceStatus === 'VOIDED' ? at(config.anchor, -2) : null,
          voidReason:
            invoiceStatus === 'VOIDED'
              ? 'Erreur de référence — scénario démo'
              : null,
          notes: 'Facture fictive de démonstration',
          createdAt: at(config.anchor, -332 + index * 18),
        },
      });
      await tx.invoiceItem.upsert({
        where: { id: key('invoice-item', index) },
        update: { unitPrice: total, total },
        create: {
          id: key('invoice-item', index),
          invoiceId: invoice.id,
          orderItemId: key('order-item', index),
          description: `Véhicule et services — dossier ${index + 1}`,
          quantity: money(1),
          unitPrice: total,
          tax: money(0),
          total,
          sourceEntity: 'demo-order',
          createdAt: at(config.anchor, -332 + index * 18),
        },
      });
      const plan = await tx.paymentPlan.upsert({
        where: { id: key('payment-plan', index) },
        update: { strategy: planStrategy, totalAmount: total, currency },
        create: {
          id: key('payment-plan', index),
          organizationId: PRIMARY_ORG_ID,
          clientId: clientId(index),
          dossierId: dossierId(index),
          orderId: key('order', index),
          strategy: planStrategy,
          totalAmount: total,
          currency,
          status: invoiceStatus === 'VOIDED' ? 'cancelled' : 'active',
          createdAt: at(config.anchor, -330 + index * 18),
        },
      });
      const installmentAmounts =
        planStrategy === 'FULL_UPFRONT' ? [total] : [firstAmount, secondAmount];
      for (
        let installmentIndex = 0;
        installmentIndex < installmentAmounts.length;
        installmentIndex += 1
      ) {
        const amount = installmentAmounts[installmentIndex];
        const installmentPaid =
          invoiceStatus === 'PAID' ||
          (invoiceStatus === 'PARTIALLY_PAID' && installmentIndex === 0)
            ? amount
            : money(0);
        const installmentStatus = installmentPaid.equals(amount)
          ? 'PAID'
          : invoiceStatus === 'OVERDUE'
            ? 'OVERDUE'
            : invoiceStatus === 'VOIDED'
              ? 'CANCELLED'
              : 'PENDING';
        await tx.paymentInstallment.upsert({
          where: { id: key('installment', `${index}:${installmentIndex}`) },
          update: {
            amount,
            paidAmount: installmentPaid,
            status: installmentStatus,
          },
          create: {
            id: key('installment', `${index}:${installmentIndex}`),
            paymentPlanId: plan.id,
            installmentNumber: installmentIndex + 1,
            label:
              planStrategy === 'FULL_UPFRONT'
                ? 'Paiement intégral'
                : installmentIndex === 0
                  ? 'Acompte 30 %'
                  : 'Solde exact',
            percentage: money(
              planStrategy === 'FULL_UPFRONT'
                ? 100
                : installmentIndex === 0
                  ? 30
                  : 70,
            ),
            amount,
            paidAmount: installmentPaid,
            dueTrigger:
              installmentIndex === 0
                ? 'ON_PLAN_CREATION'
                : 'ON_VEHICLE_RECOVERY',
            dueDate: at(config.anchor, installmentIndex === 0 ? -5 : 25),
            status: installmentStatus,
            createdAt: at(config.anchor, -330 + index * 18),
          },
        });
      }
      if (invoiceStatus === 'PARTIALLY_PAID' || invoiceStatus === 'PAID') {
        const paymentAmount = paidAmount;
        const payment = await tx.payment.upsert({
          where: { id: key('payment', index) },
          update: {
            status: 'CONFIRMED',
            amount: paymentAmount,
            allocatedAmount: paymentAmount,
            unallocatedAmount: money(0),
            exchangeRateId:
              currency === 'DZD' ? null : key('exchange-rate', `${currency}:1`),
          },
          create: {
            id: key('payment', index),
            organizationId: PRIMARY_ORG_ID,
            clientId: clientId(index),
            dossierId: dossierId(index),
            orderId: key('order', index),
            invoiceId: invoice.id,
            installmentId: key('installment', `${index}:0`),
            amount: paymentAmount,
            allocatedAmount: paymentAmount,
            unallocatedAmount: money(0),
            currency,
            paymentMethod: 'bank_transfer',
            reference: `VIR-DEMO-${index + 1}`,
            idempotencyKey: `demo-payment-${index + 1}`,
            status: 'CONFIRMED',
            paymentDate: at(config.anchor, -11 + index),
            receivedAt: at(config.anchor, -11 + index),
            confirmedAt: at(config.anchor, -10 + index),
            actorUserId: userId('finance'),
            exchangeRateId:
              currency === 'DZD' ? null : key('exchange-rate', `${currency}:1`),
            notes: 'Paiement fictif confirmé',
            createdAt: at(config.anchor, -11 + index),
          },
        });
        let remaining = paymentAmount;
        for (
          let installmentIndex = 0;
          installmentIndex < installmentAmounts.length &&
          remaining.greaterThan(0);
          installmentIndex += 1
        ) {
          const allocated = Prisma.Decimal.min(
            remaining,
            installmentAmounts[installmentIndex],
          );
          await tx.paymentAllocation.upsert({
            where: { id: key('allocation', `${index}:${installmentIndex}`) },
            update: { amount: allocated, status: 'ACTIVE' },
            create: {
              id: key('allocation', `${index}:${installmentIndex}`),
              organizationId: PRIMARY_ORG_ID,
              paymentId: payment.id,
              invoiceId: invoice.id,
              installmentId: key('installment', `${index}:${installmentIndex}`),
              amount: allocated,
              allocatedAt: at(config.anchor, -10 + index),
              status: 'ACTIVE',
            },
          });
          remaining = remaining.minus(allocated);
        }
      }
    }

    const exceptionalPayments = [
      ['pending', 'PENDING', clientId(0), money(50_000)],
      ['failed', 'FAILED', clientId(1), money(75_000)],
      ['reversed', 'REVERSED', clientId(2), money(90_000)],
    ] as const;
    for (const [slug, status, client, amount] of exceptionalPayments) {
      await tx.payment.upsert({
        where: { id: key('payment-extra', slug) },
        update: { status },
        create: {
          id: key('payment-extra', slug),
          organizationId: PRIMARY_ORG_ID,
          clientId: client,
          amount,
          allocatedAmount: money(0),
          unallocatedAmount: amount,
          currency: 'DZD',
          paymentMethod: 'cash',
          reference: `PAY-DEMO-${slug.toUpperCase()}`,
          idempotencyKey: `demo-payment-${slug}`,
          status,
          paymentDate: at(config.anchor, -4),
          receivedAt: at(config.anchor, -4),
          confirmedAt: status === 'REVERSED' ? at(config.anchor, -3) : null,
          reversedAt: status === 'REVERSED' ? at(config.anchor, -2) : null,
          reversalReason:
            status === 'REVERSED' ? 'Annulation fictive contrôlée' : null,
          actorUserId: userId('finance'),
          notes: 'Statut financier de démonstration',
          createdAt: at(config.anchor, -4),
        },
      });
    }
    const depositPayment = await tx.payment.upsert({
      where: { id: key('payment-extra', 'overpayment') },
      update: {
        status: 'CONFIRMED',
        amount: money(150_000),
        allocatedAmount: money(0),
        unallocatedAmount: money(150_000),
      },
      create: {
        id: key('payment-extra', 'overpayment'),
        organizationId: PRIMARY_ORG_ID,
        clientId: clientId(3),
        dossierId: dossierId(3),
        amount: money(150_000),
        allocatedAmount: money(0),
        unallocatedAmount: money(150_000),
        currency: 'DZD',
        paymentMethod: 'bank_transfer',
        reference: 'PAY-DEMO-OVERPAY',
        idempotencyKey: 'demo-payment-overpayment',
        status: 'CONFIRMED',
        paymentDate: at(config.anchor, -3),
        receivedAt: at(config.anchor, -3),
        confirmedAt: at(config.anchor, -3),
        actorUserId: userId('finance'),
        notes: 'Trop-perçu légitime conservé en acompte client',
        createdAt: at(config.anchor, -3),
      },
    });
    await tx.customerDeposit.upsert({
      where: { id: key('customer-deposit', 'overpayment') },
      update: { amount: money(150_000), unappliedAmount: money(150_000) },
      create: {
        id: key('customer-deposit', 'overpayment'),
        organizationId: PRIMARY_ORG_ID,
        clientId: clientId(3),
        dossierId: dossierId(3),
        paymentId: depositPayment.id,
        amount: money(150_000),
        appliedAmount: money(0),
        unappliedAmount: money(150_000),
        currency: 'DZD',
        paymentMethod: 'bank_transfer',
        reference: 'DEP-DEMO-001',
        status: 'CONFIRMED',
        paymentDate: at(config.anchor, -3),
        notes: 'Trop-perçu fictif non affecté',
        createdAt: at(config.anchor, -3),
      },
    });

    const purchasedIndexes = [3, 4, 9, 10];
    for (let entry = 0; entry < purchasedIndexes.length; entry += 1) {
      const index = purchasedIndexes[entry];
      const confirmed = entry !== 3;
      await tx.supplierPayment.upsert({
        where: { id: key('supplier-payment', entry) },
        update: {
          status: confirmed ? 'CONFIRMED' : 'REVERSED',
          exchangeRateId: key('exchange-rate', 'USD:1'),
        },
        create: {
          id: key('supplier-payment', entry),
          organizationId: PRIMARY_ORG_ID,
          supplierId: key(
            'partner',
            ['guangzhou', 'shanghai', 'shenzhen', 'ningbo'][index % 4],
          ),
          purchaseId: key('purchase', index),
          amount: money(14_000 + index * 300),
          currency: 'USD',
          paymentMethod: 'bank_transfer',
          reference: `SP-DEMO-${entry + 1}`,
          idempotencyKey: `demo-supplier-payment-${entry + 1}`,
          status: confirmed ? 'CONFIRMED' : 'REVERSED',
          paymentDate: at(config.anchor, -18 + entry),
          paidAt: at(config.anchor, -18 + entry),
          confirmedAt: at(config.anchor, -17 + entry),
          reversedAt: confirmed ? null : at(config.anchor, -2),
          reversalReason: confirmed ? null : 'Virement annulé — scénario démo',
          actorUserId: userId('finance'),
          exchangeRateId: key('exchange-rate', 'USD:1'),
          notes: 'Paiement fournisseur fictif',
          createdAt: at(config.anchor, -18 + entry),
        },
      });
    }

    const shipmentStatuses = [
      'booked',
      'loading',
      'inTransit',
      'arrived',
      'delivered',
      'inTransit',
      'arrived',
      'booked',
      'delivered',
    ];
    for (let index = 0; index < 9; index += 1) {
      const status = shipmentStatuses[index];
      const etd = at(config.anchor, -25 + index * 4);
      const eta = at(etd, 35);
      const late = index === 2;
      const effectiveEta = late ? at(config.anchor, -3) : eta;
      await tx.shipment.upsert({
        where: { id: key('shipment', index) },
        update: { status, eta: effectiveEta },
        create: {
          id: key('shipment', index),
          organizationId: PRIMARY_ORG_ID,
          shipmentNumber: `EXP-DEMO-${String(index + 1).padStart(3, '0')}`,
          carrierPartnerId: key('partner', 'carrier'),
          blNumber: `BL-DEMO-${2026001 + index}`,
          vesselName: ['Atlas Pearl', 'Méditerranée Star', 'Oran Horizon'][
            index % 3
          ],
          containerNumber: `MSCU${String(1000000 + index)}`,
          departurePort: index % 2 ? 'Shanghai' : 'Qingdao',
          arrivalPort: index % 2 ? 'Oran' : 'Alger',
          etd,
          eta: effectiveEta,
          actualDepartureDate: ['booked', 'loading'].includes(status)
            ? null
            : at(etd, 1),
          actualArrivalDate: ['arrived', 'delivered'].includes(status)
            ? at(eta, index % 2 ? 2 : -1)
            : null,
          status,
          notes: late
            ? 'Expédition active en retard'
            : index === 4
              ? 'Expédition achevée à l’heure'
              : 'Suivi opérationnel fictif',
          createdAt: at(etd, -3),
        },
      });
      await tx.shipmentVehicle.upsert({
        where: {
          shipmentId_vehicleId: {
            shipmentId: key('shipment', index),
            vehicleId: vehicleId(index),
          },
        },
        update: { orderId: key('order', index) },
        create: {
          id: key('shipment-vehicle', index),
          shipmentId: key('shipment', index),
          vehicleId: vehicleId(index),
          orderId: key('order', index),
        },
      });
      const history =
        status === 'booked'
          ? ['booked']
          : status === 'loading'
            ? ['booked', 'loading']
            : [
                'booked',
                'loading',
                'inTransit',
                ...(['arrived', 'delivered'].includes(status)
                  ? ['arrived']
                  : []),
                ...(status === 'delivered' ? ['delivered'] : []),
              ];
      for (
        let historyIndex = 0;
        historyIndex < history.length;
        historyIndex += 1
      ) {
        await tx.shipmentStatusHistory.upsert({
          where: { id: key('shipment-history', `${index}:${historyIndex}`) },
          update: {},
          create: {
            id: key('shipment-history', `${index}:${historyIndex}`),
            shipmentId: key('shipment', index),
            fromStatus: historyIndex ? history[historyIndex - 1] : null,
            toStatus: history[historyIndex],
            changedBy: userId('logistics'),
            comment: 'Mise à jour de suivi démo',
            createdAt: new Date(etd.getTime() + historyIndex * 86_400_000),
          },
        });
      }
      await tx.shippingCost.upsert({
        where: { id: key('shipping-cost', index) },
        update: { amount: money(2_000 + index * 100) },
        create: {
          id: key('shipping-cost', index),
          shipmentId: key('shipment', index),
          type: 'ocean_freight',
          amount: money(2_000 + index * 100),
          currency: 'USD',
          description: 'Fret maritime fictif',
          createdAt: etd,
        },
      });
    }

    const customsStatuses = [
      'documentsPending',
      'underReview',
      'inInspection',
      'dutiesDue',
      'cleared',
      'released',
      'blocked',
      'cleared',
      'released',
    ];
    for (let index = 0; index < 9; index += 1) {
      const status = customsStatuses[index];
      const openedAt = at(config.anchor, -18 + index * 2);
      const customsValue = money(2_500_000 + index * 80_000);
      const dutyAmount = customsValue.mul('0.15').toDecimalPlaces(2);
      const taxAmount = customsValue
        .plus(dutyAmount)
        .mul('0.19')
        .toDecimalPlaces(2);
      const feesAmount = money(25_000 + index * 1_000);
      await tx.customsFile.upsert({
        where: { id: key('customs-file', index) },
        update: {
          status,
          customsAmount: dutyAmount.plus(taxAmount).plus(feesAmount),
        },
        create: {
          id: key('customs-file', index),
          organizationId: PRIMARY_ORG_ID,
          reference: `DOU-DEMO-${String(index + 1).padStart(3, '0')}`,
          shipmentId: key('shipment', index),
          vehicleId: vehicleId(index),
          dossierId: dossierId(index),
          brokerPartnerId: key('partner', 'broker'),
          status,
          declarationNumber: `DEC-DEMO-${index + 1}`,
          customsValue,
          customsAmount: dutyAmount.plus(taxAmount).plus(feesAmount),
          dutyAmount,
          taxAmount,
          feesAmount,
          currency: 'DZD',
          openedAt,
          closedAt: ['cleared', 'released'].includes(status)
            ? at(openedAt, 5)
            : null,
          clearedAt: ['cleared', 'released'].includes(status)
            ? at(openedAt, 4)
            : null,
          releasedAt: status === 'released' ? at(openedAt, 5) : null,
          notes:
            status === 'blocked'
              ? 'Blocage documentaire fictif'
              : 'Dossier douanier fictif',
          createdAt: openedAt,
        },
      });
      const history =
        status === 'documentsPending'
          ? ['documentsPending']
          : ['documentsPending', status];
      for (
        let historyIndex = 0;
        historyIndex < history.length;
        historyIndex += 1
      ) {
        await tx.customsStatusHistory.upsert({
          where: { id: key('customs-history', `${index}:${historyIndex}`) },
          update: {},
          create: {
            id: key('customs-history', `${index}:${historyIndex}`),
            customsFileId: key('customs-file', index),
            fromStatus: historyIndex ? history[historyIndex - 1] : null,
            toStatus: history[historyIndex],
            changedBy: userId('logistics'),
            comment: 'Historique douane démo',
            createdAt: at(openedAt, historyIndex),
          },
        });
      }
    }

    const costTypes = [
      'PURCHASE',
      'SHIPPING',
      'CUSTOMS',
      'DUTY',
      'TAX',
      'INSURANCE',
      'STORAGE',
      'OTHER',
    ];
    for (let index = 0; index < 24; index += 1) {
      const dossierIndex = index % 18;
      const type = costTypes[index % costTypes.length];
      const amount =
        dossierIndex === 8
          ? 3_800_000
          : dossierIndex === 1
            ? 1_550_000
            : dossierIndex % 3 === 0
              ? 600_000
              : dossierIndex % 3 === 1
                ? 1_500_000
                : 3_500_000;
      await tx.cost.upsert({
        where: { id: key('cost', index) },
        update: {
          amount: money(amount),
          amountInBaseCurrency: money(amount),
          status: 'POSTED',
        },
        create: {
          id: key('cost', index),
          organizationId: PRIMARY_ORG_ID,
          type,
          amount: money(amount),
          currency: 'DZD',
          amountInBaseCurrency: money(amount),
          dossierId: dossierId(dossierIndex),
          orderId: key('order', dossierIndex),
          shipmentId: index < 9 ? key('shipment', index) : null,
          customsFileId: index < 9 ? key('customs-file', index) : null,
          occurredAt: at(config.anchor, -330 + index * 14),
          description: `${type} — coût fictif non dupliqué`,
          actorUserId: userId('finance'),
          status: 'POSTED',
          createdAt: at(config.anchor, -330 + index * 14),
        },
      });
    }
  });
}

interface FixtureSpec {
  category: string;
  kind: string;
  mimeType: string;
  name: string;
  bytes: Buffer;
}

const pdfBytes = (label: string) =>
  Buffer.from(
    `%PDF-1.4\n% Auto-Import demo fixture\n1 0 obj<</Type/Catalog>>endobj\n% ${label}\n%%EOF\n`,
    'utf8',
  );
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function colorPng(red: number, green: number, blue: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, red, green, blue]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function ensureFixture(
  organizationId: string,
  index: number | string,
  spec: FixtureSpec,
): Promise<{ checksum: string; size: bigint; storageKey: string }> {
  const fileId = key('file', `${organizationId}:${index}`);
  const category = spec.category.replace(/[^a-zA-Z0-9_-]/g, '');
  const extension = spec.mimeType === 'image/png' ? '.png' : '.pdf';
  const storageKey = `${organizationId}/${category}/2026/${fileId}${extension}`;
  const absolutePath = join(config.storageRoot, ...storageKey.split('/'));
  await mkdir(dirname(absolutePath), { recursive: true });
  try {
    const current = await readFile(absolutePath);
    if (!current.equals(spec.bytes)) {
      throw new Error(`Existing deterministic fixture differs: ${storageKey}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeFile(absolutePath, spec.bytes, { flag: 'wx' });
  }
  return {
    storageKey,
    checksum: sha256(spec.bytes),
    size: BigInt(spec.bytes.length),
  };
}

async function seedDocumentsAndOperations(): Promise<void> {
  const fixtures: FixtureSpec[] = [
    {
      category: 'vehicle_photo',
      kind: 'VEHICLE_PHOTO',
      mimeType: 'image/png',
      name: 'byd-song-plus-demo.png',
      bytes: onePixelPng,
    },
    {
      category: 'business_document',
      kind: 'BUSINESS_DOCUMENT',
      mimeType: 'application/pdf',
      name: 'registre-commerce-demo.pdf',
      bytes: pdfBytes('Business document'),
    },
    {
      category: 'dossier_document',
      kind: 'DOSSIER_DOCUMENT',
      mimeType: 'application/pdf',
      name: 'fiche-dossier-demo.pdf',
      bytes: pdfBytes('Dossier document'),
    },
    {
      category: 'proof',
      kind: 'PROOF',
      mimeType: 'application/pdf',
      name: 'preuve-demo.pdf',
      bytes: pdfBytes('Proof'),
    },
    {
      category: 'contract',
      kind: 'CONTRACT',
      mimeType: 'application/pdf',
      name: 'contrat-signe-demo.pdf',
      bytes: pdfBytes('Contract'),
    },
    {
      category: 'customs_document',
      kind: 'CUSTOMS_DOCUMENT',
      mimeType: 'application/pdf',
      name: 'declaration-douane-demo.pdf',
      bytes: pdfBytes('Customs document'),
    },
    {
      category: 'payment_receipt',
      kind: 'PAYMENT_RECEIPT',
      mimeType: 'application/pdf',
      name: 'recu-paiement-demo.pdf',
      bytes: pdfBytes('Payment receipt'),
    },
  ];
  for (let index = 0; index < fixtures.length; index += 1) {
    const spec = fixtures[index];
    const stored = await ensureFixture(PRIMARY_ORG_ID, index, spec);
    await prisma.$transaction(async (tx) => {
      await tx.fileAsset.upsert({
        where: { id: key('file', `${PRIMARY_ORG_ID}:${index}`) },
        update: {
          storageKey: stored.storageKey,
          originalName: spec.name,
          mimeType: spec.mimeType,
          size: stored.size,
          checksum: stored.checksum,
          category: spec.kind,
          status: 'active',
        },
        create: {
          id: key('file', `${PRIMARY_ORG_ID}:${index}`),
          organizationId: PRIMARY_ORG_ID,
          storageKey: stored.storageKey,
          originalName: spec.name,
          mimeType: spec.mimeType,
          size: stored.size,
          checksum: stored.checksum,
          category: spec.kind,
          status: 'active',
          uploadedBy: userId('logistics'),
          createdAt: at(config.anchor, -6 + index),
        },
      });
      await tx.dossierDocumentAsset.upsert({
        where: { id: key('dossier-document', index) },
        update: { kind: spec.kind, status: 'valid' },
        create: {
          id: key('dossier-document', index),
          organizationId: PRIMARY_ORG_ID,
          dossierId: dossierId(index),
          fileId: key('file', `${PRIMARY_ORG_ID}:${index}`),
          kind: spec.kind,
          documentType: [
            'photo_vehicule',
            'registre_commerce',
            'fiche_dossier',
            'preuve_paiement',
            'contrat',
            'documents_douane',
            'recu_paiement',
          ][index],
          title: spec.name,
          description: 'Fixture privée de démonstration',
          status: 'valid',
          uploadedBy: userId('logistics'),
          createdAt: at(config.anchor, -6 + index),
        },
      });
      if (spec.kind === 'VEHICLE_PHOTO') {
        await tx.vehiclePhoto.upsert({
          where: { id: key('vehicle-photo', index) },
          update: { isPrimary: true },
          create: {
            id: key('vehicle-photo', index),
            vehicleId: vehicleId(0),
            fileId: key('file', `${PRIMARY_ORG_ID}:${index}`),
            isPrimary: true,
            sortOrder: 0,
            createdAt: at(config.anchor, -6),
          },
        });
      }
      if (spec.kind === 'BUSINESS_DOCUMENT') {
        await tx.businessDocument.upsert({
          where: { id: key('business-document', index) },
          update: { title: 'Registre de commerce fictif' },
          create: {
            id: key('business-document', index),
            fileId: key('file', `${PRIMARY_ORG_ID}:${index}`),
            uploadedBy: userId('admin'),
            documentType: 'registre_commerce',
            title: 'Registre de commerce fictif',
            description: 'Document de démonstration',
            entityType: 'organization',
            entityId: PRIMARY_ORG_ID,
            createdAt: at(config.anchor, -5),
          },
        });
      }
      if (spec.kind === 'CUSTOMS_DOCUMENT') {
        await tx.customsDocument.upsert({
          where: { id: key('customs-document', index) },
          update: { status: 'valid' },
          create: {
            id: key('customs-document', index),
            customsFileId: key('customs-file', 5),
            fileId: key('file', `${PRIMARY_ORG_ID}:${index}`),
            documentType: 'declaration',
            status: 'valid',
            uploadedAt: at(config.anchor, -2),
          },
        });
      }
    });
  }
  const galleryColors = [
    [32, 108, 180],
    [220, 86, 64],
    [54, 158, 92],
  ] as const;
  for (let vehicleIndex = 0; vehicleIndex < 22; vehicleIndex += 1) {
    for (
      let sortOrder = vehicleIndex === 0 ? 1 : 0;
      sortOrder < 3;
      sortOrder += 1
    ) {
      const fixtureKey = `vehicle-gallery:${vehicleIndex}:${sortOrder}`;
      const [red, green, blue] =
        galleryColors[(vehicleIndex + sortOrder) % galleryColors.length];
      const spec: FixtureSpec = {
        category: 'vehicle_photo',
        kind: 'VEHICLE_PHOTO',
        mimeType: 'image/png',
        name: `vehicle-${vehicleIndex + 1}-${sortOrder + 1}.png`,
        bytes: colorPng(red, green, blue),
      };
      const stored = await ensureFixture(PRIMARY_ORG_ID, fixtureKey, spec);
      const fileId = key('file', `${PRIMARY_ORG_ID}:${fixtureKey}`);
      await prisma.$transaction(async (tx) => {
        await tx.fileAsset.upsert({
          where: { id: fileId },
          update: {
            storageKey: stored.storageKey,
            size: stored.size,
            checksum: stored.checksum,
            mimeType: spec.mimeType,
            status: 'active',
          },
          create: {
            id: fileId,
            organizationId: PRIMARY_ORG_ID,
            storageKey: stored.storageKey,
            originalName: spec.name,
            mimeType: spec.mimeType,
            size: stored.size,
            checksum: stored.checksum,
            category: spec.kind,
            status: 'active',
            uploadedBy: userId('logistics'),
            createdAt: at(config.anchor, -6),
          },
        });
        await tx.vehiclePhoto.upsert({
          where: { id: key('vehicle-photo', `${vehicleIndex}:${sortOrder}`) },
          update: {
            vehicleId: vehicleId(vehicleIndex),
            fileId,
            sortOrder,
            isPrimary: sortOrder === 0,
          },
          create: {
            id: key('vehicle-photo', `${vehicleIndex}:${sortOrder}`),
            vehicleId: vehicleId(vehicleIndex),
            fileId,
            sortOrder,
            isPrimary: sortOrder === 0,
            createdAt: at(config.anchor, -6),
          },
        });
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const taskStatuses = ['todo', 'in_progress', 'completed', 'cancelled'];
    for (let index = 0; index < 28; index += 1) {
      const status = taskStatuses[index % taskStatuses.length];
      const assigneeSlug = ['admin', 'call', 'commercial', 'logistics'][
        index % 4
      ];
      const dueDate =
        index % 5 === 0
          ? at(config.anchor, -3)
          : index % 5 === 1
            ? at(config.anchor, 1)
            : at(config.anchor, 7 + index);
      await tx.task.upsert({
        where: { id: key('task', index) },
        update: { assignedTo: userId(assigneeSlug), status, dueDate },
        create: {
          id: key('task', index),
          organizationId: PRIMARY_ORG_ID,
          assignedTo: userId(assigneeSlug),
          createdBy: userId('manager'),
          title:
            index % 5 === 0
              ? `Relance en retard ${index + 1}`
              : `Action opérationnelle ${index + 1}`,
          description: 'Tâche fictive réconciliable avec les vues démo.',
          type:
            index % 4 === 0
              ? 'callback'
              : index % 4 === 1
                ? 'appointment'
                : 'follow_up',
          notes: 'Sans donnée sensible',
          priority: index % 4 === 0 ? 'high' : 'normal',
          status,
          dueDate,
          relatedType:
            index % 3 === 0
              ? 'prospect'
              : index % 3 === 1
                ? 'client'
                : 'dossier',
          relatedId:
            index % 3 === 0
              ? prospectId(index % 27)
              : index % 3 === 1
                ? clientId(index % 18)
                : dossierId(index % 18),
          prospectId: index % 3 === 0 ? prospectId(index % 27) : null,
          clientId: index % 3 === 1 ? clientId(index % 18) : null,
          dossierId: index % 3 === 2 ? dossierId(index % 18) : null,
          completedAt: status === 'completed' ? at(config.anchor, -1) : null,
          createdAt: at(config.anchor, -20 + index),
        },
      });
      await tx.notification.upsert({
        where: { id: key('notification', index) },
        update: {
          userId: userId(['admin', 'commercial', 'manager'][index % 3]),
          readAt: index % 3 === 0 ? at(config.anchor, -1) : null,
        },
        create: {
          id: key('notification', index),
          organizationId: PRIMARY_ORG_ID,
          userId: userId(['admin', 'commercial', 'manager'][index % 3]),
          type: index % 4 === 0 ? 'TASK_OVERDUE' : 'DEMO_OPERATION',
          category:
            index % 4 === 0 ? 'task' : index % 4 === 1 ? 'finance' : 'workflow',
          severity: index % 5 === 0 ? 'warning' : 'info',
          title:
            index % 4 === 0
              ? 'Tâche de démonstration en retard'
              : `Notification opérationnelle ${index + 1}`,
          content: 'Notification persistée fictive.',
          channel: 'in_app',
          relatedType: 'task',
          relatedId: key('task', index),
          entityUrl: '/tasks',
          dedupeKey: `demo-notification-${index + 1}`,
          readAt: index % 3 === 0 ? at(config.anchor, -1) : null,
          createdAt: at(config.anchor, -10 + index / 10),
        },
      });
      await tx.auditLog.upsert({
        where: { id: key('audit', index) },
        update: {},
        create: {
          id: key('audit', index),
          organizationId: PRIMARY_ORG_ID,
          userId: userId(index % 2 ? 'commercial' : 'manager'),
          action: index % 2 ? 'DEMO_VIEW' : 'DEMO_UPDATE',
          entityType: index % 3 === 0 ? 'dossier' : 'task',
          entityId:
            index % 3 === 0 ? dossierId(index % 18) : key('task', index),
          oldValues: { status: 'previous', redacted: true },
          newValues: { status: 'demo', summary: 'Safe fictional change' },
          ipAddress: '127.0.0.1',
          userAgent: 'AutoImport-Demo-Seeder',
          correlationId: `demo-audit-${index + 1}`,
          createdAt: at(config.anchor, -15 + index / 10),
        },
      });
    }
    await tx.notificationTemplate.upsert({
      where: { id: key('notification-template', 'task') },
      update: { active: true },
      create: {
        id: key('notification-template', 'task'),
        organizationId: PRIMARY_ORG_ID,
        name: 'Rappel démo',
        eventType: 'DEMO_TASK_DUE',
        subject: 'Action à traiter',
        content: 'Une action fictive arrive à échéance.',
        channel: 'in_app',
        active: true,
        createdAt: at(config.anchor, -30),
      },
    });
  });
}

async function seedSecondaryTenant(): Promise<void> {
  const secondaryFile: FixtureSpec = {
    category: 'business_document',
    kind: 'BUSINESS_DOCUMENT',
    mimeType: 'application/pdf',
    name: 'sahara-document-demo.pdf',
    bytes: pdfBytes('Secondary tenant document'),
  };
  const stored = await ensureFixture(
    SECONDARY_ORG_ID,
    'secondary',
    secondaryFile,
  );
  await prisma.$transaction(async (tx) => {
    await tx.prospect.upsert({
      where: { id: key('secondary-prospect', 0) },
      update: { status: 'qualified' },
      create: {
        id: key('secondary-prospect', 0),
        organizationId: SECONDARY_ORG_ID,
        firstName: 'Meriem',
        lastName: 'Prospect Isolation',
        phone: '+213770909090',
        email: 'meriem@secondary.demo.invalid',
        wilaya: 'Oran',
        source: 'recommandation',
        status: 'qualified',
        qualification: 'WARM',
        assignedTo: userId('secondary-admin'),
        notes: 'Donnée du tenant secondaire uniquement',
        createdAt: at(config.anchor, -12),
      },
    });
    await tx.client.upsert({
      where: { id: key('secondary-client', 0) },
      update: { status: 'active' },
      create: {
        id: key('secondary-client', 0),
        organizationId: SECONDARY_ORG_ID,
        firstName: 'Rachid',
        lastName: 'Client Isolation',
        phone: '+213660808080',
        email: 'rachid@secondary.demo.invalid',
        nationality: 'Algérienne',
        address: 'Oran — adresse fictive',
        status: 'active',
        assignedTo: userId('secondary-admin'),
        createdAt: at(config.anchor, -20),
      },
    });
    await tx.partner.upsert({
      where: { id: key('secondary-partner', 0) },
      update: { status: 'active' },
      create: {
        id: key('secondary-partner', 0),
        organizationId: SECONDARY_ORG_ID,
        name: 'Sahara Fournisseur Fictif',
        type: 'supplier',
        country: 'Chine',
        city: 'Yiwu',
        contactPerson: 'Demo Contact',
        email: 'supplier@secondary.demo.invalid',
        status: 'active',
        createdAt: at(config.anchor, -40),
      },
    });
    await tx.vehicle.upsert({
      where: { id: key('secondary-vehicle', 0) },
      update: { status: 'available' },
      create: {
        id: key('secondary-vehicle', 0),
        organizationId: SECONDARY_ORG_ID,
        vin: 'LSEC2600000000001',
        brand: 'Geely',
        model: 'Geometry C',
        year: 2026,
        mileage: 12,
        condition: 'new',
        purchasePrice: money(17_500),
        sellingPrice: money(3_900_000),
        currency: 'USD',
        status: 'available',
        acquisitionType: 'stock',
        supplierId: key('secondary-partner', 0),
        acquiredAt: at(config.anchor, -10),
        createdAt: at(config.anchor, -10),
      },
    });
    await tx.order.upsert({
      where: { id: key('secondary-order', 0) },
      update: { status: 'draft' },
      create: {
        id: key('secondary-order', 0),
        organizationId: SECONDARY_ORG_ID,
        orderNumber: 'ISO-CMD-001',
        clientId: key('secondary-client', 0),
        createdBy: userId('secondary-admin'),
        status: 'draft',
        subtotal: money(3_900_000),
        discount: money(0),
        total: money(3_900_000),
        currency: 'DZD',
        orderDate: at(config.anchor, -5),
        createdAt: at(config.anchor, -5),
      },
    });
    await tx.orderItem.upsert({
      where: { id: key('secondary-order-item', 0) },
      update: {},
      create: {
        id: key('secondary-order-item', 0),
        orderId: key('secondary-order', 0),
        vehicleId: key('secondary-vehicle', 0),
        unitPrice: money(3_900_000),
        discount: money(0),
        total: money(3_900_000),
        createdAt: at(config.anchor, -5),
      },
    });
    await tx.dossier.upsert({
      where: { id: key('secondary-dossier', 0) },
      update: { status: 'offerSelected' },
      create: {
        id: key('secondary-dossier', 0),
        organizationId: SECONDARY_ORG_ID,
        reference: 'ISO-CIF-001',
        type: 'VEHICLE_SALE_CIF',
        clientId: key('secondary-client', 0),
        orderId: key('secondary-order', 0),
        status: 'offerSelected',
        salesUserId: userId('secondary-admin'),
        openedAt: at(config.anchor, -4),
        createdAt: at(config.anchor, -4),
      },
    });
    await tx.dossierStatusHistory.upsert({
      where: { id: key('secondary-dossier-history', 0) },
      update: {},
      create: {
        id: key('secondary-dossier-history', 0),
        dossierId: key('secondary-dossier', 0),
        fromStatus: null,
        toStatus: 'offerSelected',
        changedBy: userId('secondary-admin'),
        comment: 'Scénario isolation',
        createdAt: at(config.anchor, -4),
      },
    });
    await tx.invoice.upsert({
      where: { id: key('secondary-invoice', 0) },
      update: { status: 'ISSUED' },
      create: {
        id: key('secondary-invoice', 0),
        organizationId: SECONDARY_ORG_ID,
        invoiceNumber: 'ISO-FAC-001',
        orderId: key('secondary-order', 0),
        dossierId: key('secondary-dossier', 0),
        clientId: key('secondary-client', 0),
        status: 'ISSUED',
        subtotal: money(3_900_000),
        tax: money(0),
        discount: money(0),
        total: money(3_900_000),
        paidAmount: money(0),
        currency: 'DZD',
        issueDate: at(config.anchor, -3),
        dueDate: at(config.anchor, 15),
        notes: 'Facture tenant secondaire',
        createdAt: at(config.anchor, -3),
      },
    });
    await tx.fileAsset.upsert({
      where: { id: key('file', `${SECONDARY_ORG_ID}:secondary`) },
      update: {
        storageKey: stored.storageKey,
        size: stored.size,
        checksum: stored.checksum,
      },
      create: {
        id: key('file', `${SECONDARY_ORG_ID}:secondary`),
        organizationId: SECONDARY_ORG_ID,
        storageKey: stored.storageKey,
        originalName: secondaryFile.name,
        mimeType: secondaryFile.mimeType,
        size: stored.size,
        checksum: stored.checksum,
        category: secondaryFile.kind,
        status: 'active',
        uploadedBy: userId('secondary-admin'),
        createdAt: at(config.anchor, -2),
      },
    });
    await tx.businessDocument.upsert({
      where: { id: key('secondary-business-document', 0) },
      update: {},
      create: {
        id: key('secondary-business-document', 0),
        fileId: key('file', `${SECONDARY_ORG_ID}:secondary`),
        uploadedBy: userId('secondary-admin'),
        documentType: 'registre_commerce',
        title: 'Document privé Sahara',
        entityType: 'organization',
        entityId: SECONDARY_ORG_ID,
        createdAt: at(config.anchor, -2),
      },
    });
    await tx.task.upsert({
      where: { id: key('secondary-task', 0) },
      update: { status: 'todo' },
      create: {
        id: key('secondary-task', 0),
        organizationId: SECONDARY_ORG_ID,
        assignedTo: userId('secondary-admin'),
        createdBy: userId('secondary-admin'),
        title: 'Tâche privée tenant secondaire',
        type: 'follow_up',
        priority: 'normal',
        status: 'todo',
        dueDate: at(config.anchor, 3),
        dossierId: key('secondary-dossier', 0),
        createdAt: at(config.anchor, -1),
      },
    });
    await tx.notification.upsert({
      where: { id: key('secondary-notification', 0) },
      update: { readAt: null },
      create: {
        id: key('secondary-notification', 0),
        organizationId: SECONDARY_ORG_ID,
        userId: userId('secondary-admin'),
        type: 'DEMO_ISOLATION',
        category: 'general',
        severity: 'info',
        title: 'Notification privée Sahara',
        content: 'Visible uniquement dans le tenant secondaire.',
        channel: 'in_app',
        dedupeKey: 'demo-secondary-isolation',
        createdAt: at(config.anchor, -1),
      },
    });
  });
  const colors = [
    [76, 126, 178],
    [202, 97, 72],
    [68, 146, 105],
  ] as const;
  for (let sortOrder = 0; sortOrder < 3; sortOrder += 1) {
    const fixtureKey = `secondary-vehicle-gallery:${sortOrder}`;
    const [red, green, blue] = colors[sortOrder];
    const spec: FixtureSpec = {
      category: 'vehicle_photo',
      kind: 'VEHICLE_PHOTO',
      mimeType: 'image/png',
      name: `secondary-vehicle-${sortOrder + 1}.png`,
      bytes: colorPng(red, green, blue),
    };
    const galleryFile = await ensureFixture(SECONDARY_ORG_ID, fixtureKey, spec);
    const fileId = key('file', `${SECONDARY_ORG_ID}:${fixtureKey}`);
    await prisma.$transaction(async (tx) => {
      await tx.fileAsset.upsert({
        where: { id: fileId },
        update: {
          storageKey: galleryFile.storageKey,
          size: galleryFile.size,
          checksum: galleryFile.checksum,
          mimeType: spec.mimeType,
          status: 'active',
        },
        create: {
          id: fileId,
          organizationId: SECONDARY_ORG_ID,
          storageKey: galleryFile.storageKey,
          originalName: spec.name,
          mimeType: spec.mimeType,
          size: galleryFile.size,
          checksum: galleryFile.checksum,
          category: spec.kind,
          status: 'active',
          uploadedBy: userId('secondary-admin'),
          createdAt: at(config.anchor, -6),
        },
      });
      await tx.vehiclePhoto.upsert({
        where: { id: key('secondary-vehicle-photo', sortOrder) },
        update: {
          vehicleId: key('secondary-vehicle', 0),
          fileId,
          sortOrder,
          isPrimary: sortOrder === 0,
        },
        create: {
          id: key('secondary-vehicle-photo', sortOrder),
          vehicleId: key('secondary-vehicle', 0),
          fileId,
          sortOrder,
          isPrimary: sortOrder === 0,
          createdAt: at(config.anchor, -6),
        },
      });
    });
  }
}

async function printSummary(): Promise<void> {
  const [
    organizations,
    users,
    prospects,
    clients,
    vehicles,
    offers,
    dossiers,
    invoices,
    shipments,
    customs,
    files,
  ] = await Promise.all([
    prisma.organization.count({
      where: { id: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
    }),
    prisma.user.count({
      where: { organizationId: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
    }),
    prisma.prospect.count({ where: { organizationId: PRIMARY_ORG_ID } }),
    prisma.client.count({ where: { organizationId: PRIMARY_ORG_ID } }),
    prisma.vehicle.count({ where: { organizationId: PRIMARY_ORG_ID } }),
    prisma.chinaOffer.count({ where: { organizationId: PRIMARY_ORG_ID } }),
    prisma.dossier.count({ where: { organizationId: PRIMARY_ORG_ID } }),
    prisma.invoice.count({ where: { organizationId: PRIMARY_ORG_ID } }),
    prisma.shipment.count({ where: { organizationId: PRIMARY_ORG_ID } }),
    prisma.customsFile.count({ where: { organizationId: PRIMARY_ORG_ID } }),
    prisma.fileAsset.count({
      where: { organizationId: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
    }),
  ]);
  console.table([
    {
      organizations,
      users,
      prospects,
      clients,
      vehicles,
      offers,
      dossiers,
      invoices,
      shipments,
      customs,
      files,
    },
  ]);
  console.log('Demo identities (use the supplied DEMO_SEED_PASSWORD):');
  for (const [slug, , , role, status] of [
    ...PRIMARY_USERS,
    ...SECONDARY_USERS,
  ]) {
    console.log(`- ${emailFor(slug)} — ${role} (${status})`);
  }
}

async function main(): Promise<void> {
  await assertDisposableDatabase(prisma, config);
  console.log(
    `Demo seed target verified: ${config.databaseName} (${config.environment}, ${config.scale})`,
  );
  const stages = [
    ['foundation', seedFoundation],
    ['crm-call-center', seedCrm],
    ['commerce-dossiers', seedCommerceAndDossiers],
    ['finance-logistics', seedFinanceLogistics],
    ['documents-operations', seedDocumentsAndOperations],
    ['secondary-tenant', seedSecondaryTenant],
  ] as const;
  for (const [name, stage] of stages) {
    try {
      await stage();
      console.log(`✓ ${name}`);
    } catch (error) {
      throw new Error(`Demo seed stage failed: ${name}`, { cause: error });
    }
  }
  await printSummary();
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Unknown demo seed error',
    );
    if (error instanceof Error && error.cause instanceof Error) {
      console.error(error.cause.message);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
