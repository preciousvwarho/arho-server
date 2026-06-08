import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminPermission } from '@prisma/client';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AdminJwtAuthGuard } from '../../common/guards/admin-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateItemDto } from '../admins/dto/create-item.dto';
import { imageUploadOptions } from '../uploads/multer-image.options';
import { UploadsService } from '../uploads/uploads.service';
import { ListItemsQuery } from './dto/list-items.query';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';

type ItemUploadFiles = {
  image?: Express.Multer.File[];
  imageTwo?: Express.Multer.File[];
};

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly uploads: UploadsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List recyclable item types' })
  async list(@Query() query: ListItemsQuery) {
    return { status: 'success', data: await this.items.list(query) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a recyclable item type' })
  async get(@Param('id') id: string) {
    return { status: 'success', data: { item: await this.items.get(id) } };
  }

  @Post()
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_DEPOSITS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'imageTwo', maxCount: 1 },
      ],
      imageUploadOptions,
    ),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'description', 'weightKg', 'pointValue'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        weightKg: { type: 'number' },
        pointValue: { type: 'number' },
        image: { type: 'string', format: 'binary' },
        imageTwo: { type: 'string', format: 'binary' },
        imageUrl: { type: 'string' },
        imageTwoUrl: { type: 'string' },
      },
    },
  })
  async create(
    @Body() dto: CreateItemDto,
    @UploadedFiles() files: ItemUploadFiles,
  ) {
    const image = files.image?.[0]
      ? await this.uploads.uploadImage(files.image[0].buffer, 'items')
      : undefined;
    const imageTwo = files.imageTwo?.[0]
      ? await this.uploads.uploadImage(files.imageTwo[0].buffer, 'items')
      : undefined;
    return {
      status: 'success',
      data: { item: await this.items.create(dto, image, imageTwo) },
    };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_DEPOSITS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'imageTwo', maxCount: 1 },
      ],
      imageUploadOptions,
    ),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @UploadedFiles() files: ItemUploadFiles,
  ) {
    const image = files.image?.[0]
      ? await this.uploads.uploadImage(files.image[0].buffer, 'items')
      : undefined;
    const imageTwo = files.imageTwo?.[0]
      ? await this.uploads.uploadImage(files.imageTwo[0].buffer, 'items')
      : undefined;
    return {
      status: 'success',
      data: { item: await this.items.update(id, dto, image, imageTwo) },
    };
  }

  @Patch(':id/toggle-status')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_DEPOSITS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async toggleStatus(@Param('id') id: string) {
    return {
      status: 'success',
      data: { item: await this.items.toggleStatus(id) },
    };
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_DEPOSITS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async delete(@Param('id') id: string) {
    return { status: 'success', data: { item: await this.items.delete(id) } };
  }
}
