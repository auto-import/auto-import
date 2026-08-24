import {
  Body,
  Controller,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CallCenterService } from './call-center.service';
import { ProviderRegistryService } from './providers/provider-registry.service';

interface RawRequest {
  rawBody?: Buffer;
}

@Controller('provider-webhooks')
export class ProviderWebhooksController {
  constructor(
    private readonly service: CallCenterService,
    private readonly providers: ProviderRegistryService,
  ) {}

  @Post(':provider/telephony')
  @Public()
  call(
    @Param('provider') providerKey: string,
    @Body() body: unknown,
    @Headers('x-provider-signature') signature: string | undefined,
    @Req() request: RawRequest,
  ) {
    this.assertMockBoundary(providerKey);
    const provider = this.providers.telephony(providerKey);
    const rawBody = request.rawBody?.toString('utf8') ?? JSON.stringify(body);
    if (!provider.verifyWebhook(rawBody, signature)) {
      throw new UnauthorizedException('Invalid provider signature');
    }
    return this.service.ingestCallEvent(
      providerKey,
      provider.parseWebhook(body),
    );
  }

  @Post(':provider/whatsapp')
  @Public()
  whatsapp(
    @Param('provider') providerKey: string,
    @Body() body: unknown,
    @Headers('x-provider-signature') signature: string | undefined,
    @Req() request: RawRequest,
  ) {
    this.assertMockBoundary(providerKey);
    const provider = this.providers.messaging(providerKey);
    const rawBody = request.rawBody?.toString('utf8') ?? JSON.stringify(body);
    if (!provider.verifyWebhook(rawBody, signature)) {
      throw new UnauthorizedException('Invalid provider signature');
    }
    return this.service.ingestWhatsappEvent(
      providerKey,
      provider.parseWebhook(body),
    );
  }

  private assertMockBoundary(providerKey: string) {
    if (providerKey === 'mock' && process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Not found');
    }
  }
}
