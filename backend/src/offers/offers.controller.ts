import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  BadRequestException,
  UploadedFiles,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { UploadedBufferFile } from '../documents/documents.service';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateOfferDto,
  AssignOfferDto,
  CreatePurchaseFromOfferDto,
  FilterOfferDto,
  MaterializeOfferDto,
  ReleaseOfferDto,
  ReserveOfferDto,
  UpdateOfferDto,
  TransitionOfferDto,
} from './dto/offer.dto';
import { OffersService } from './offers.service';

@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get('statistics')
  @RequirePermission(Permission.OFFERS_READ)
  statistics(@CurrentUser() user: AuthenticatedUser) {
    return this.offers.statistics(user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.OFFERS_WRITE)
  create(@Body() dto: CreateOfferDto, @CurrentUser() user: AuthenticatedUser) {
    void dto;
    void user;
    throw new BadRequestException(
      'Offer creation requires exactly three photos; use /offers/with-photos',
    );
  }

  @Post('with-photos')
  @RequirePermission(Permission.OFFERS_WRITE)
  @UseInterceptors(
    FilesInterceptor('photos', 3, {
      limits: { files: 3, fileSize: 8 * 1024 * 1024 },
    }),
  )
  createWithPhotos(
    @Body() dto: CreateOfferDto,
    @UploadedFiles() photos: UploadedBufferFile[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.createWithPhotos(
      dto,
      user.organizationId,
      user.id,
      photos ?? [],
    );
  }

  @Patch(':id/photos')
  @RequirePermission(Permission.OFFERS_WRITE)
  @UseInterceptors(
    FilesInterceptor('photos', 3, {
      limits: { files: 3, fileSize: 8 * 1024 * 1024 },
    }),
  )
  replacePhotos(
    @Param('id') id: string,
    @UploadedFiles() photos: UploadedBufferFile[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.replacePhotos(
      id,
      user.organizationId,
      user.id,
      photos ?? [],
    );
  }

  @Get('photos/:photoId')
  @RequirePermission(Permission.OFFERS_READ)
  async photo(
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.offers.photoStream(photoId, user.organizationId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.size);
    response.setHeader('Cache-Control', 'private, max-age=300');
    file.stream.pipe(response);
  }

  @Get()
  @RequirePermission(Permission.OFFERS_READ)
  findAll(
    @Query() query: FilterOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.OFFERS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.offers.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.OFFERS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.update(id, dto, user.organizationId, user.id);
  }

  @Post(':id/status')
  @RequirePermission(Permission.OFFERS_TRANSITION)
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.transition(id, dto, user.id, user.organizationId);
  }

  @Post(':id/assign')
  @RequirePermission(Permission.OFFERS_WRITE)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.assignToDossier(id, dto, user.id, user.organizationId);
  }

  @Post(':id/create-purchase')
  @RequirePermission(Permission.PURCHASES_WRITE)
  createPurchase(
    @Param('id') id: string,
    @Body() dto: CreatePurchaseFromOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.createPurchaseFromOffer(
      id,
      dto,
      user.id,
      user.organizationId,
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.OFFERS_WRITE)
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.offers.archive(id, user.organizationId);
  }

  @Post(':id/reservations')
  @RequirePermission(Permission.OFFERS_WRITE)
  reserve(
    @Param('id') id: string,
    @Body() dto: ReserveOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.reserve(id, dto, user.id, user.organizationId);
  }

  @Post('reservations/:id/release')
  @RequirePermission(Permission.OFFERS_WRITE)
  release(
    @Param('id') id: string,
    @Body() dto: ReleaseOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.release(id, dto.reason, user.organizationId);
  }

  @Post('reservations/:id/materialize')
  @RequirePermission(Permission.PURCHASES_WRITE)
  materialize(
    @Param('id') id: string,
    @Body() dto: MaterializeOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.materialize(id, dto, user.id, user.organizationId);
  }
}
