import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Permission } from '@auto-import/contracts';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(','),
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        typeof client.handshake.auth?.token === 'string'
          ? client.handshake.auth.token
          : client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) throw new Error('Missing token');
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.auth.getCurrentUser(payload.sub);
      if (!user.permissions.includes(Permission.NOTIFICATIONS_READ))
        throw new Error('Forbidden');
      await client.join(`user:${user.id}`);
      client.emit('notifications.ready', { reconnectRequired: true });
    } catch {
      client.disconnect(true);
    }
  }

  emitUser(userId: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit('notification.created', {
      payload,
      occurredAt: new Date().toISOString(),
    });
  }
}
