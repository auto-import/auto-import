import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Permission } from '@auto-import/contracts';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';

interface AuthenticatedSocket extends Socket {
  data: { user?: AuthenticatedUser };
}

@WebSocketGateway({
  namespace: '/call-center',
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(','),
    credentials: true,
  },
})
export class CallCenterGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const header = client.handshake.headers.authorization;
      const token =
        typeof client.handshake.auth?.token === 'string'
          ? client.handshake.auth.token
          : header?.replace(/^Bearer\s+/i, '');
      if (!token) throw new Error('Missing token');
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.auth.getCurrentUser(payload.sub);
      if (!user.permissions.includes(Permission.CALL_CENTER_ACCESS)) {
        throw new Error('Insufficient permission');
      }
      client.data.user = user;
      await client.join(`organization:${user.organizationId}`);
      await client.join(`user:${user.id}`);
      client.emit('call-center.ready', { reconnectRequired: true });
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {}

  emitOrganization(
    organizationId: string,
    event: string,
    payload: unknown,
  ): void {
    this.server
      ?.to(`organization:${organizationId}`)
      .emit(event, { payload, occurredAt: new Date().toISOString() });
  }

  emitUser(userId: string, event: string, payload: unknown): void {
    this.server
      ?.to(`user:${userId}`)
      .emit(event, { payload, occurredAt: new Date().toISOString() });
  }
}
